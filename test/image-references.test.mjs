import test from "node:test";
import assert from "node:assert/strict";
import {validateRequest,validatedReferenceSource} from "../src/schema.mjs";
import {buildImageRequest,referenceToGeminiPart,readRepoReference} from "../src/reference-image.mjs";

const base={schemaVersion:1,kind:"image",prompt:"Character sheet of this exact character",aspect_ratio:"16:9"};

test("image jobs accept 1-3 references from refs/, Cloudinary or gs://",()=>{
  const req=validateRequest({...base,reference_images:["refs/peek/peek-present.png","gs://bucket-x/a.png"]});
  assert.deepEqual(req.reference_images,["refs/peek/peek-present.png","gs://bucket-x/a.png"]);
  assert.equal(validateRequest(base).reference_images,undefined);
});
test("reference guards: count, repeats, traversal, outside paths, video jobs",()=>{
  assert.throws(()=>validateRequest({...base,reference_images:[]}));
  assert.throws(()=>validateRequest({...base,reference_images:["refs/a.png","refs/b.png","refs/c.png","refs/d.png"]}));
  assert.throws(()=>validateRequest({...base,reference_images:["refs/a.png","refs/a.png"]}));
  assert.throws(()=>validateRequest({...base,reference_images:"refs/a.png"}));
  for(const bad of ["refs/../src/cli.png","/etc/passwd.png","refs/a.svg","src/a.png","refs//a.png","https://example.com/a.png"])
    assert.throws(()=>validatedReferenceSource(bad),undefined,bad);
  assert.throws(()=>validateRequest({schemaVersion:1,kind:"video",prompt:"A flying kite",reference_images:["refs/a.png"]}));
});
test("repo references are read from the checkout and sent inline before the prompt",async()=>{
  const part=await referenceToGeminiPart("refs/peek/peek-present.png");
  assert.equal(part.inlineData.mimeType,"image/png");
  const gcs=await referenceToGeminiPart("gs://bucket-x/start.jpg");
  assert.deepEqual(gcs,{fileData:{fileUri:"gs://bucket-x/start.jpg",mimeType:"image/jpeg"}});
  const req=validateRequest({...base,reference_images:["refs/peek/peek-present.png","gs://bucket-x/start.jpg"]});
  const body=buildImageRequest(req,[part,gcs]);
  assert.equal(body.contents[0].parts.length,3);
  assert.equal(body.contents[0].parts[2].text,base.prompt);
  assert.deepEqual(body.generationConfig.imageConfig,{aspectRatio:"16:9",imageSize:"1K"});
  assert.throws(()=>buildImageRequest(req,[part]),/not all prepared/);
});
test("a refs/ file that is not an image is refused",async()=>{
  await assert.rejects(readRepoReference("refs/missing.png"));
});
