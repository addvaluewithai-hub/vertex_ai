const IMAGES = new Set(["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"]);
const VIDEOS = new Set(["gemini-omni-1.1-flash-preview"]);
export function validatedCloudinaryVideoUrl(value) {
  if (typeof value !== "string" || value.length > 1500) fail("source_video_url must be a Cloudinary HTTPS URL");
  let u;
  try { u=new URL(value); } catch { fail("Malformed source_video_url"); }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com" || u.port || u.username || u.password || u.search || u.hash ||
      !/^\/[a-zA-Z0-9_-]+\/video\/upload\/.+\.mp4$/i.test(u.pathname))
    fail("Only public res.cloudinary.com/.../video/upload/...mp4 URLs are allowed");
  return u.href;
}
const RATIOS = new Set(["1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9"]);
const RES = ["360p","720p","1080p","4k"];
function fail(m){throw Error(m);}
export function validateJobId(v) {
  if(typeof v!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(v)) fail("Invalid job ID");
  return v;
}
export function validateRequest(x, policy={}) {
  if(!x || typeof x!=="object" || Array.isArray(x)) fail("Expected request JSON object");
  const allowed=new Set(["schemaVersion","mode","kind","prompt","model","aspect_ratio","image_size","duration_seconds","resolution","reference_image_uri","source_video_url","source_video_uri","trim_start_seconds","trim_duration_seconds","preserve_audio"]);
  for(const k of Object.keys(x)) if(!allowed.has(k)) fail("Unknown request field: "+k);
  if(x.schemaVersion!==1) fail("schemaVersion must equal 1");
  const mode=x.mode??"dry-run";
  if(!["dry-run","produce"].includes(mode)) fail("mode must be dry-run or produce");
  if(!["image","video","video_edit"].includes(x.kind)) fail("kind must be image, video or video_edit");
  if(typeof x.prompt!=="string" || x.prompt.trim().length<3 || x.prompt.length>4000) fail("prompt must contain 3-4000 characters");
  const image=x.kind==="image",model=x.model??(image?"gemini-3.1-flash-lite-image":"gemini-omni-1.1-flash-preview");
  if(!(image?IMAGES:VIDEOS).has(model)) fail("Unsupported model for kind");
  const aspect_ratio=x.aspect_ratio??(image?"1:1":x.kind==="video_edit"?"9:16":"16:9");
  if(!RATIOS.has(aspect_ratio) || (!image && !["16:9","9:16"].includes(aspect_ratio))) fail("Unsupported aspect_ratio");
  const common={schemaVersion:1,mode,kind:x.kind,prompt:x.prompt.trim(),model,aspect_ratio};
  if(image) {
    if(x.duration_seconds!==undefined || x.resolution!==undefined || x.reference_image_uri!==undefined || x.source_video_url!==undefined || x.source_video_uri!==undefined || x.trim_start_seconds!==undefined || x.trim_duration_seconds!==undefined || x.preserve_audio!==undefined) fail("Video fields not allowed in image request");
    const image_size=x.image_size??"1K";
    if(image_size!=="1K") fail("Only 1K images allowed to limit cost");
    return {...common,image_size};
  }
  if(x.image_size!==undefined) fail("image_size only applies to images");
  const resolution=x.resolution??"360p",maxResolution=policy.maxResolution??process.env.MAX_VIDEO_RESOLUTION??"360p";
  if(!RES.includes(resolution) || !RES.includes(maxResolution) || RES.indexOf(resolution)>RES.indexOf(maxResolution)) fail("Exceeded MAX_VIDEO_RESOLUTION policy");
  if(x.kind==="video_edit"){
    if(x.duration_seconds!==undefined || x.reference_image_uri!==undefined) fail("video_edit cannot use duration_seconds or reference_image_uri");
    const hasUrl=x.source_video_url!==undefined,hasGcs=x.source_video_uri!==undefined;
    if(hasUrl===hasGcs) fail("video_edit requires exactly one source_video_url or source_video_uri");
    const source=hasUrl?{source_video_url:validatedCloudinaryVideoUrl(x.source_video_url)}:(()=>{
      if(typeof x.source_video_uri!=="string"||!/^gs:\/\/[a-z0-9][a-z0-9._-]{2,220}\/[^\s?#]{1,800}$/.test(x.source_video_uri))fail("source_video_uri must be gs://bucket/file.mp4");
      if(!x.source_video_uri.toLowerCase().endsWith(".mp4"))fail("GCS video must end in .mp4");
      return {source_video_uri:x.source_video_uri};
    })();
    if(!hasUrl && (x.trim_start_seconds!==undefined||x.trim_duration_seconds!==undefined)) fail("Trim fields require source_video_url; GCS video must already be trimmed");
    const trim_start_seconds=x.trim_start_seconds??0,trim_duration_seconds=x.trim_duration_seconds??8;
    const maxEdit=Number(policy.maxEditSeconds??process.env.MAX_EDIT_SECONDS??8);
    if(!Number.isInteger(maxEdit)||maxEdit<3||maxEdit>10)fail("Invalid MAX_EDIT_SECONDS");
    if(!Number.isInteger(trim_start_seconds)||trim_start_seconds<0||trim_start_seconds>600)fail("trim_start_seconds must be an integer 0-600");
    if(!Number.isInteger(trim_duration_seconds)||trim_duration_seconds<3||trim_duration_seconds>10||trim_duration_seconds>maxEdit)fail("trim_duration_seconds exceeds MAX_EDIT_SECONDS");
    if(x.preserve_audio!==undefined&&typeof x.preserve_audio!=="boolean")fail("preserve_audio must be boolean");
    if(!hasUrl&&x.preserve_audio===true)fail("preserve_audio requires Cloudinary source, not GCS");
    return {...common,...source,resolution,...(hasUrl?{trim_start_seconds,trim_duration_seconds,preserve_audio:x.preserve_audio??true}:{preserve_audio:false})};
  }
  if(x.source_video_url!==undefined||x.source_video_uri!==undefined||x.trim_start_seconds!==undefined||x.trim_duration_seconds!==undefined||x.preserve_audio!==undefined)
    fail("Editing fields only valid for video_edit");
  const duration_seconds=x.duration_seconds??3;
  if(!Number.isInteger(duration_seconds) || duration_seconds<3 || duration_seconds>10) fail("Video duration must be integer 3-10");
  const maxSeconds=Number(policy.maxSeconds??process.env.MAX_VIDEO_SECONDS??5);
  if(!Number.isInteger(maxSeconds) || maxSeconds<3 || maxSeconds>10 || duration_seconds>maxSeconds) fail("Exceeded MAX_VIDEO_SECONDS policy");
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
