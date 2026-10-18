#!/usr/bin/env node
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {validateRequest,validateJobId,imageParts,videoPart} from "./schema.mjs";
function arg(k,d){const n=process.argv.indexOf("--"+k);return n<0?d:process.argv[n+1];}
function fail(m){throw Error(m);}
async function post(url,payload){
  const {GoogleAuth}=await import("google-auth-library");
  const auth=new GoogleAuth({scopes:["https://www.googleapis.com/auth/cloud-platform"]});
  const client=await auth.getClient();
  const t=await client.getAccessToken();
  if(!t.token) fail("No Google Cloud OAuth token from ADC");
  const r=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+t.token,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(10*60*1000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) fail("Google Cloud HTTP "+r.status+": "+String(data.error?.message??"Unknown").slice(0,400));
  return data;
}
function outputBytes(base64){
  if(typeof base64!=="string"||!base64.length||base64.length>70_000_000) fail("Invalid or oversized inline media");
  const buffer=Buffer.from(base64,"base64");
  if(!buffer.length||buffer.length>52_000_000) fail("Empty or oversized generated media");
  return buffer;
}
async function generate(req,project){
  if(typeof project!=="string" || !/^[a-z][a-z0-9-]{4,62}$/.test(project)) fail("Missing/invalid GCP_PROJECT_ID");
  if(req.kind==="image"){
    const url="https://aiplatform.googleapis.com/v1/projects/"+project+"/locations/global/publishers/google/models/"+req.model+":generateContent";
    const r=await post(url,{contents:[{role:"user",parts:[{text:req.prompt}]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:req.aspect_ratio,imageSize:req.image_size}}});
    const p=imageParts(r)[0]?.inlineData;
    if(!p) fail("Image model returned no supported image");
    return {bytes:outputBytes(p.data),mime:p.mimeType,usage:r.usageMetadata?.totalTokenCount??null};
  }
  const url="https://aiplatform.googleapis.com/v1beta1/projects/"+project+"/locations/global/interactions";
  const input=[{type:"text",text:req.prompt}];
  if(req.reference_image_uri) input.push({type:"image",uri:req.reference_image_uri,mime_type:/\.jpe?g$/i.test(req.reference_image_uri)?"image/jpeg":"image/png"});
  const r=await post(url,{model:req.model,input,response_format:[{type:"video",delivery:"inline",aspect_ratio:req.aspect_ratio,resolution:req.resolution,duration:req.duration_seconds+"s"}],generation_config:{video_config:{task:req.reference_image_uri?"image_to_video":"text_to_video"}}});
  if(r.status && r.status!=="completed") fail("Video status "+r.status+" (interaction "+(r.id??"unknown")+")");
  const p=videoPart(r);
  if(!p) fail("Omni returned no inline video");
  return {bytes:outputBytes(p.data),mime:p.mime_type??"video/mp4",usage:r.usage?.total_tokens??null,interaction_id:r.id??null};
}
function extension(m){return {"image/png":"png","image/jpeg":"jpg","image/webp":"webp","video/mp4":"mp4"}[m]??null;}
async function publish(path,kind,jobId){
  if(!process.env.CLOUDINARY_URL) return null;
  try {
    const {v2:cloudinary}=await import("cloudinary");
    cloudinary.config({secure:true});
    const r=await cloudinary.uploader.upload(path,{resource_type:kind,public_id:"vertex-media-factory/"+jobId+"-"+(process.env.GITHUB_RUN_ID??"local"),overwrite:false});
    return r.secure_url;
  } catch {
    console.error("Cloudinary upload failed; download GitHub artifact instead");
    return null;
  }
}
async function main(){
  const jobId=validateJobId(arg("job-id",process.env.JOB_ID??"local"));
  const outputPath=arg("result","result.json"),outDir=arg("out","out");
  const req=validateRequest(JSON.parse(await readFile(arg("file","request.json"),"utf8")));
  let result={id:jobId,status:"validated",billable:false,mode:req.mode,kind:req.kind,model:req.model};
  if(process.argv.includes("--validate-only")||req.mode==="dry-run"){
    await writeFile(outputPath,JSON.stringify(result,null,2)+"\n");
    console.log("DRY RUN: zero Google Cloud requests");
    return;
  }
  result={...result,billable:true,status:"started"};
  try{
    const item=await generate(req,process.env.GCP_PROJECT_ID);
    const ext=extension(item.mime);
    if(!ext) fail("Unsupported output MIME: "+item.mime);
    await mkdir(outDir,{recursive:true});
    const name=jobId+"."+ext,local=join(outDir,name);
    await writeFile(local,item.bytes);
    const url=await publish(local,req.kind,jobId);
    result={...result,status:"completed",completed_at:new Date().toISOString(),
      usage_tokens:item.usage,interaction_id:item.interaction_id??null,
      output:{filename:"out/"+name,mime_type:item.mime,bytes:item.bytes.length,...(url?{url}:{})},
      github_run_url:process.env.GITHUB_REPOSITORY&&process.env.GITHUB_RUN_ID
        ?"https://github.com/"+process.env.GITHUB_REPOSITORY+"/actions/runs/"+process.env.GITHUB_RUN_ID:null};
    if(process.env.CLOUDINARY_URL&&!url) result.delivery_warning="Cloudinary delivery failed; use GitHub artifact";
  }catch(e){result={...result,status:"failed",error:String(e.message).slice(0,500)};process.exitCode=1;}
  await writeFile(outputPath,JSON.stringify(result,null,2)+"\n");
  console.log("Job "+jobId+": "+result.status);
  if(result.status==="failed") console.error(result.error);
}
main().catch(e=>{console.error("Factory error: "+e.message);process.exitCode=1;});
