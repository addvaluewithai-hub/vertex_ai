const IMAGES = new Set(["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"]);
const VIDEOS = new Set(["gemini-omni-1.1-flash-preview"]);
const RATIOS = new Set(["1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9"]);
const RES = ["360p","720p","1080p","4k"];
function fail(m){throw Error(m);}
export function validateJobId(v) {
  if(typeof v!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(v)) fail("Invalid job ID");
  return v;
}
export function validateRequest(x, policy={}) {
  if(!x || typeof x!=="object" || Array.isArray(x)) fail("Expected request JSON object");
  const allowed=new Set(["schemaVersion","mode","kind","prompt","model","aspect_ratio","image_size","duration_seconds","resolution","reference_image_uri"]);
  for(const k of Object.keys(x)) if(!allowed.has(k)) fail("Unknown request field: "+k);
  if(x.schemaVersion!==1) fail("schemaVersion must equal 1");
  const mode=x.mode??"dry-run";
  if(!["dry-run","produce"].includes(mode)) fail("mode must be dry-run or produce");
  if(!["image","video"].includes(x.kind)) fail("kind must be image or video");
  if(typeof x.prompt!=="string" || x.prompt.trim().length<3 || x.prompt.length>4000) fail("prompt must contain 3-4000 characters");
  const image=x.kind==="image",model=x.model??(image?"gemini-3.1-flash-lite-image":"gemini-omni-1.1-flash-preview");
  if(!(image?IMAGES:VIDEOS).has(model)) fail("Unsupported model for kind");
  const aspect_ratio=x.aspect_ratio??(image?"1:1":"16:9");
  if(!RATIOS.has(aspect_ratio) || (!image && !["16:9","9:16"].includes(aspect_ratio))) fail("Unsupported aspect_ratio");
  const common={schemaVersion:1,mode,kind:x.kind,prompt:x.prompt.trim(),model,aspect_ratio};
  if(image) {
    if(x.duration_seconds!==undefined || x.resolution!==undefined || x.reference_image_uri!==undefined) fail("Video fields not allowed in image request");
    const image_size=x.image_size??"1K";
    if(image_size!=="1K") fail("Only 1K images allowed to limit cost");
    return {...common,image_size};
  }
  if(x.image_size!==undefined) fail("image_size only applies to images");
  const duration_seconds=x.duration_seconds??3;
  if(!Number.isInteger(duration_seconds) || duration_seconds<3 || duration_seconds>10) fail("Video duration must be integer 3-10");
  const maxSeconds=Number(policy.maxSeconds??process.env.MAX_VIDEO_SECONDS??5);
  if(!Number.isInteger(maxSeconds) || maxSeconds<3 || maxSeconds>10 || duration_seconds>maxSeconds) fail("Exceeded MAX_VIDEO_SECONDS policy");
  const resolution=x.resolution??"360p",maxResolution=policy.maxResolution??process.env.MAX_VIDEO_RESOLUTION??"360p";
  if(!RES.includes(resolution) || !RES.includes(maxResolution) || RES.indexOf(resolution)>RES.indexOf(maxResolution)) fail("Exceeded MAX_VIDEO_RESOLUTION policy");
  if(x.reference_image_uri!==undefined && (typeof x.reference_image_uri!=="string" || !/^gs:\/\/[a-z0-9][a-z0-9._-]{2,220}\/[^\s?#]{1,800}$/.test(x.reference_image_uri)))
    fail("reference_image_uri must be gs://bucket/object");
  return {...common,duration_seconds,resolution,...(x.reference_image_uri?{reference_image_uri:x.reference_image_uri}:{})};
}
export function imageParts(r) {
  return (r?.candidates?.[0]?.content?.parts??[]).filter(p=>p?.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType??""));
}
export function videoPart(r) {
  const parts=(r?.steps??[]).filter(s=>s.type==="model_output").flatMap(s=>s.content??[]);
  return parts.find(p=>p?.type==="video" && typeof p.data==="string")??(r?.output_video?.data?r.output_video:null);
}
