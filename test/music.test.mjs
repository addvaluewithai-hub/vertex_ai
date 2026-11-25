import test from "node:test";
import assert from "node:assert/strict";
import {validateRequest,audioPart,musicText,buildMusicRequest,responseShape} from "../src/schema.mjs";
const base={schemaVersion:1,kind:"music",prompt:"Upbeat pop song.\n\nLyrics:\n[Verse]\nالمَأَشَّة\nbroom"};
test("music defaults to dry-run and the platform-documented model",()=>{
  const r=validateRequest(base);
  assert.equal(r.mode,"dry-run");
  assert.equal(r.model,"lyria-3-pro-preview");
  assert.deepEqual(Object.keys(r).sort(),["kind","mode","model","prompt","schemaVersion"]);
});
test("music accepts the three Lyria models and nothing else",()=>{
  for(const model of ["lyria-3-pro-preview","lyria-3-clip-preview","lyria-3.5"]) assert.equal(validateRequest({...base,model}).model,model);
  assert.throws(()=>validateRequest({...base,model:"gemini-omni-1.1-flash-preview"}));
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"video",prompt:"A flying kite",model:"lyria-3.5"}));
});
test("music rejects image and video fields",()=>{
  for(const extra of [{aspect_ratio:"9:16"},{duration_seconds:5},{resolution:"360p"},{image_size:"1K"},{reference_images:["refs/peek/peek-wave.png"]},{reference_image_uri:"gs://valid-bucket/a.png"}])
    assert.throws(()=>validateRequest({...base,...extra}));
});
test("music payload and decoders follow the Interactions API shape",()=>{
  const req=validateRequest({...base,mode:"produce"});
  assert.deepEqual(buildMusicRequest(req),{model:"lyria-3-pro-preview",input:[{type:"user_input",content:[{type:"text",text:req.prompt}]}]});
  const r={status:"completed",steps:[
    {type:"model_output",content:[{type:"text",text:" [Verse] la la "}]},
    {type:"model_output",content:[{type:"audio",mime_type:"audio/mpeg",data:"QQ=="}]}]};
  assert.equal(audioPart(r).data,"QQ==");
  assert.equal(musicText(r),"[Verse] la la");
  assert.equal(audioPart({steps:[{type:"model_output",content:[{type:"text",text:"x"}]}]}),null);
});
test("audio is found in other response layouts, and the shape report hides media",()=>{
  assert.equal(audioPart({outputs:[{type:"audio",mime_type:"audio/wav",data:"QUJD"}]}).mime_type,"audio/wav");
  assert.equal(audioPart({candidates:[{content:{parts:[{inlineData:{mimeType:"audio/mpeg",data:"QUJD"}}]}}]}).data,"QUJD");
  assert.equal(audioPart({steps:[{type:"model_output",content:[{type:"image",mime_type:"image/png",data:"QUJD"}]}]}),null);
  const shape=JSON.stringify(responseShape({status:"completed",steps:[{type:"model_output",content:[{type:"audio",data:"A".repeat(5000)}]}]}));
  assert.ok(shape.includes("string(5000)") && shape.length<300);
});
