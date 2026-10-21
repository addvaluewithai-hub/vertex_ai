import test from "node:test";
import assert from "node:assert/strict";
import {validateRequest,validateJobId,imageParts,videoPart} from "../src/schema.mjs";
test("dry-run default",()=>assert.equal(validateRequest({schemaVersion:1,kind:"image",prompt:"Colorful sunset"}).mode,"dry-run"));
test("cheap video",()=>assert.equal(validateRequest({schemaVersion:1,mode:"produce",kind:"video",prompt:"A flying kite",duration_seconds:3,resolution:"360p"}).resolution,"360p"));
test("guards",()=>{
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"video",prompt:"A flying kite",duration_seconds:10}));
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"video",prompt:"A flying kite",resolution:"4k"}));
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"image",prompt:"A flying kite",model:"gemini-omni-1.1-flash-preview"}));
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"image",prompt:"A flying kite",api_key:"secret"}));
  assert.throws(()=>validateJobId("../../oops"));
});
test("decoders",()=>{
  assert.equal(imageParts({candidates:[{content:{parts:[{inlineData:{mimeType:"image/png",data:"QQ=="}}]}}]}).length,1);
  assert.equal(videoPart({steps:[{type:"model_output",content:[{type:"video",data:"QQ=="}]}]}).data,"QQ==");
});

test("video_edit accepts Cloudinary source, 8 sec trim and preserved speech",()=>{
 const req=validateRequest({schemaVersion:1,kind:"video_edit",prompt:"Put the speaker in a cafe",
  source_video_url:"https://res.cloudinary.com/lskr7x7h/video/upload/v1792351589/vertex-media-factory/issue-6-39158746305.mp4",
  trim_duration_seconds:8,aspect_ratio:"9:16"});
 assert.equal(req.trim_duration_seconds,8);
 assert.equal(req.preserve_audio,true);
 assert.equal(req.model,"gemini-omni-1.1-flash-preview");
});
test("video_edit safety and quota guard",()=>{
 const base={schemaVersion:1,kind:"video_edit",prompt:"Put the speaker in a cafe"};
 assert.throws(()=>validateRequest({...base,source_video_url:"https://example.com/file.mp4"}));
 assert.throws(()=>validateRequest({...base,source_video_url:"https://res.cloudinary.com.evil.test/a/video/upload/a.mp4"}));
 assert.throws(()=>validateRequest({...base,source_video_url:"https://res.cloudinary.com/a/video/upload/a.mp4",trim_duration_seconds:10}));
 assert.throws(()=>validateRequest({...base,source_video_url:"https://res.cloudinary.com/a/video/upload/a.mp4",source_video_uri:"gs://valid-bucket/x.mp4"}));
});

test("Omni edit payload follows Interactions API edit task",async()=>{
 const {buildEditRequest}=await import("../src/edit-video.mjs");
 const request=validateRequest({schemaVersion:1,kind:"video_edit",
  prompt:"Move speaking man into a cafe with a blazer",
  source_video_uri:"gs://example-bucket/trimmed.mp4",aspect_ratio:"9:16",
  resolution:"360p",preserve_audio:false});
 const payload=buildEditRequest(request,{type:"video",uri:request.source_video_uri,mime_type:"video/mp4"});
 assert.equal(payload.generation_config.video_config.task,"edit");
 assert.equal(payload.input[1].uri,"gs://example-bucket/trimmed.mp4");
 assert.equal(payload.response_format[0].delivery,"inline");
 assert.equal(payload.response_format[0].aspect_ratio,undefined);
});
