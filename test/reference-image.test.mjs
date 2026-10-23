import test from "node:test";
import assert from "node:assert/strict";
import {validateRequest,validatedReferenceImageUri} from "../src/schema.mjs";
import {prepareReferenceImage,buildVideoRequest} from "../src/reference-image.mjs";

const uri="https://res.cloudinary.com/as9o12al/image/upload/v1792752940/otti-video-reference-frames/otti-casual-start-9x16.jpg";
test("reference image rejects non-Cloudinary hosts, credentials, ports, queries and non-images",()=>{
  assert.equal(validatedReferenceImageUri(uri),uri);
  for(const bad of [uri.replace("res.cloudinary.com","res.cloudinary.com.evil.test"),uri.replace("https:","http:"),uri.replace("https://","https://user@"),uri.replace(".com/",".com:444/"),uri+"?x=y",uri.replace(".jpg",".mp4"),"file:///etc/passwd"])
    assert.throws(()=>validatedReferenceImageUri(bad));
});
test("Cloudinary reference embeds original bytes with detected MIME and no redirects",async()=>{
  const bytes=Buffer.from([255,216,255,224,1,2,3]);
  const part=await prepareReferenceImage(uri,{download:async(url,options)=>{
    assert.equal(url,uri);assert.equal(options.redirect,"error");
    return new Response(bytes,{headers:{"content-type":"image/jpeg"}});
  }});
  assert.equal(part.mime_type,"image/jpeg");
  assert.deepEqual(Buffer.from(part.data,"base64"),bytes);
  assert.equal(part.uri,undefined);
});
test("invalid and oversized downloads fail before any model call",async()=>{
  await assert.rejects(prepareReferenceImage(uri,{download:async()=>new Response("not an image")}),/not PNG/);
  await assert.rejects(prepareReferenceImage(uri,{download:async()=>new Response("x",{headers:{"content-length":String(11*1024*1024)}})}),/exceeds/);
  await assert.rejects(prepareReferenceImage(uri,{download:async()=>new Response(new Uint8Array(10*1024*1024+1))}),/exceeds/);
});
test("GCS references remain supported without a download",async()=>{
  const part=await prepareReferenceImage("gs://example-bucket/start.jpg",{download:()=>{throw Error("Unexpected download");}});
  assert.equal(part.uri,"gs://example-bucket/start.jpg");assert.equal(part.mime_type,"image/jpeg");
});
test("pilot request uses image_to_video, 5s 720p vertical output and unchanged prompt",()=>{
  const raw={schemaVersion:1,kind:"video",mode:"produce",prompt:"Animate this exact character.",reference_image_uri:uri,duration_seconds:5,resolution:"720p",aspect_ratio:"9:16"};
  assert.throws(()=>validateRequest(raw,{maxResolution:"360p"}),/MAX_VIDEO_RESOLUTION/);
  assert.throws(()=>validateRequest({...raw,resolution:"1080p"},{maxResolution:"720p"}),/MAX_VIDEO_RESOLUTION/);
  const req=validateRequest(raw,{maxResolution:"720p"});
  const body=buildVideoRequest(req,{type:"image",data:"AA==",mime_type:"image/jpeg"});
  assert.equal(body.input[0].text,raw.prompt);assert.equal(body.generation_config.video_config.task,"image_to_video");
  assert.deepEqual(body.response_format,[{type:"video",delivery:"inline",aspect_ratio:"9:16",resolution:"720p",duration:"5s"}]);
  assert.throws(()=>buildVideoRequest(req,null),/Missing/);
});
