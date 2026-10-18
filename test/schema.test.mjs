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
