import {readFile,stat} from "node:fs/promises";
import {validatedReferenceImageUri,validatedReferenceSource} from "./schema.mjs";

const MAX_IMAGE_BYTES=10*1024*1024;
function sniff(bytes){
  if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if(bytes.length>=12 && bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") return "image/webp";
  throw Error("Reference is not PNG, JPEG or WebP");
}
// A reference committed under refs/ in this repository (the character sheets live there), read from the checkout.
export async function readRepoReference(path,{root=process.cwd()}={}) {
  validatedReferenceSource(path);
  if(!path.startsWith("refs/")) throw Error("Not a repository reference: "+path);
  const full=root+"/"+path;
  if((await stat(full)).size>MAX_IMAGE_BYTES) throw Error("Reference image exceeds 10 MiB");
  const bytes=await readFile(full);
  return {type:"image",data:bytes.toString("base64"),mime_type:sniff(bytes)};
}
// Any reference source as a part for Gemini generateContent (image jobs).
export async function referenceToGeminiPart(source,{download=fetch,root}={}) {
  const part=source.startsWith("refs/")?await readRepoReference(source,{root}):await prepareReferenceImage(source,{download});
  return part.uri?{fileData:{fileUri:part.uri,mimeType:part.mime_type}}:{inlineData:{mimeType:part.mime_type,data:part.data}};
}
export async function prepareReferenceImage(uri,{download=fetch}={}) {
  validatedReferenceImageUri(uri);
  if(uri.startsWith("gs://")) return {
    type:"image",uri,mime_type:/\.jpe?g$/i.test(uri)?"image/jpeg":/\.webp$/i.test(uri)?"image/webp":"image/png"
  };
  // Download only allowlisted Cloudinary assets; never follow a redirect.
  const response=await download(uri,{redirect:"error",signal:AbortSignal.timeout(60_000)});
  if(!response.ok || !response.body) throw Error("Reference image download HTTP "+response.status);
  if(Number(response.headers?.get("content-length")??0)>MAX_IMAGE_BYTES) throw Error("Reference image exceeds 10 MiB");
  const parts=[];let total=0;
  for await(const part of response.body){
    const chunk=Buffer.from(part);total+=chunk.length;
    if(total>MAX_IMAGE_BYTES) throw Error("Reference image exceeds 10 MiB");
    parts.push(chunk);
  }
  const bytes=Buffer.concat(parts);
  const mime_type=sniff(bytes);
  // Encode the original bytes without resizing or recompressing the image.
  return {type:"image",data:bytes.toString("base64"),mime_type};
}

// Image job body: the reference images first, then the prompt that says how to use them.
export function buildImageRequest(req,referenceParts=[]){
  if((req.reference_images?.length??0)!==referenceParts.length) throw Error("Reference images were not all prepared");
  return {contents:[{role:"user",parts:[...referenceParts,{text:req.prompt}]}],
    generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:req.aspect_ratio,imageSize:req.image_size}}};
}
export function buildVideoRequest(req,reference){
  if(Boolean(req.reference_image_uri)!==Boolean(reference)) throw Error("Missing or unexpected reference image");
  return {
    model:req.model,
    input:[{type:"text",text:req.prompt},...(reference?[reference]:[])],
    response_format:[{type:"video",delivery:"inline",aspect_ratio:req.aspect_ratio,resolution:req.resolution,duration:req.duration_seconds+"s"}],
    generation_config:{video_config:{task:reference?"image_to_video":"text_to_video"}}
  };
}
