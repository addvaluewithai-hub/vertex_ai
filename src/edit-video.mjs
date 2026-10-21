import {mkdtemp,readFile,writeFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";

const MAX_SOURCE_BYTES=20*1024*1024;
const MAX_TRIMMED_BYTES=18*1024*1024;
async function run(program,args) {
  await new Promise((resolve,reject)=>{
    const proc=spawn(program,args,{stdio:["ignore","ignore","pipe"]});
    let errors="";
    proc.stderr.on("data",chunk=>{errors=(errors+chunk.toString()).slice(-1500);});
    proc.on("error",reject);
    proc.on("close",code=>code===0?resolve():reject(Error(program+" failed: "+errors)));
  });
}
export function buildEditRequest(req,content) {
  if(content?.type!=="video"||content?.mime_type!=="video/mp4"||!(content.data||content.uri))
    throw Error("Missing editing input video");
  return {
    model:req.model,
    input:[{type:"text",text:req.prompt},{...content}],
    response_format:[{type:"video",delivery:"inline",resolution:req.resolution}],
    generation_config:{video_config:{task:"edit"}}
  };
}
export async function prepareEditVideoInput(req,{download=fetch}={}) {
  if(req.source_video_uri) return {
    content:{type:"video",uri:req.source_video_uri,mime_type:"video/mp4"},
    trimmedPath:null,cleanup:async()=>{}
  };
  const folder=await mkdtemp(join(tmpdir(),"vertex-edit-"));
  const original=join(folder,"original.mp4"),trimmed=join(folder,"trimmed.mp4");
  try {
    // URL has already been validated; redirect=error blocks redirect-based SSRF.
    const response=await download(req.source_video_url,{redirect:"error",signal:AbortSignal.timeout(90_000)});
    if(!response.ok || !response.body)throw Error("Cloudinary source download HTTP "+response.status);
    const announced=Number(response.headers?.get("content-length")??"0");
    if(announced>MAX_SOURCE_BYTES)throw Error("Source video exceeds 20 MiB");
    const parts=[];let total=0;
    for await(const part of response.body){
      const chunk=Buffer.from(part);
      total+=chunk.length;
      if(total>MAX_SOURCE_BYTES)throw Error("Source video exceeds 20 MiB");
      parts.push(chunk);
    }
    if(total<1000)throw Error("Downloaded video is empty");
    await writeFile(original,Buffer.concat(parts));
    await run("ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-y",
      "-ss",String(req.trim_start_seconds),"-i",original,"-t",String(req.trim_duration_seconds),
      "-vf","scale=if(gte(iw\\,ih)\\,640\\,-2):if(gte(iw\\,ih)\\,-2\\,640)",
      "-r","24","-c:v","libx264","-preset","veryfast","-crf","24","-pix_fmt","yuv420p",
      "-c:a","aac","-b:a","96k","-movflags","+faststart",trimmed]);
    const size=(await stat(trimmed)).size;
    if(size<1000||size>MAX_TRIMMED_BYTES)throw Error("Trimmed video is too big or empty");
    const bytes=await readFile(trimmed);
    return {content:{type:"video",data:bytes.toString("base64"),mime_type:"video/mp4"},
      trimmedPath:trimmed,cleanup:async()=>rm(folder,{recursive:true,force:true})};
  } catch(e) {await rm(folder,{recursive:true,force:true});throw e;}
}
export async function remuxOriginalAudio(videoBytes,trimmedPath) {
  const folder=await mkdtemp(join(tmpdir(),"vertex-remux-"));
  try {
    const generated=join(folder,"generated.mp4"),completed=join(folder,"completed.mp4");
    await writeFile(generated,videoBytes);
    await run("ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-y","-i",generated,"-i",trimmedPath,
      "-map","0:v:0","-map","1:a:0?","-c:v","copy","-c:a","aac",
      "-shortest","-movflags","+faststart",completed]);
    return await readFile(completed);
  } finally {await rm(folder,{recursive:true,force:true});}
}
