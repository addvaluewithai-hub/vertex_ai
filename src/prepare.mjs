#!/usr/bin/env node
import {readFile,writeFile,appendFile} from "node:fs/promises";
import {validateRequest,validateJobId} from "./schema.mjs";
async function main(){
  const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
  const name=process.env.GITHUB_EVENT_NAME;
  let jobId,raw;
  if(name==="workflow_dispatch"){
    raw=JSON.parse(event.inputs?.request_json||"{}");
    jobId=event.inputs?.job_id||"run-"+process.env.GITHUB_RUN_ID;
  } else if(name==="repository_dispatch"){
    if(event.action!=="media.generate") throw Error("Invalid event type");
    raw=event.client_payload?.request;
    jobId=event.client_payload?.job_id||"run-"+process.env.GITHUB_RUN_ID;
  } else if(name==="issues"){
    const i=event.issue;
    if(event.action!=="opened" || event.repository?.full_name!=="addvaluewithai-hub/vertex_ai" ||
      i?.pull_request || i?.state!=="open" || i?.user?.login!=="addvaluewithai-hub" ||
      event.sender?.login!=="addvaluewithai-hub" || process.env.GITHUB_ACTOR!=="addvaluewithai-hub")
      throw Error("Only owner-opened issues are permitted");
    const m=(i.body||"").match(/^\s*~~~json\s*\n([\s\S]+?)\n~~~\s*$/);
    if(!m || m[1].length>7000) throw Error("Issue body must contain only a ~~~json fenced object");
    raw=JSON.parse(m[1]);
    jobId="issue-"+i.number;
  } else throw Error("Unsupported GitHub trigger");
  jobId=validateJobId(jobId);
  const request=validateRequest(raw);
  await writeFile("request.json",JSON.stringify(request,null,2)+"\n");
  await writeFile("job-id.txt",jobId+"\n");
  await writeFile("result.json",JSON.stringify({id:jobId,status:request.mode==="produce"?"queued":"validated",mode:request.mode,kind:request.kind,model:request.model,billable:false},null,2)+"\n");
  if(process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,"mode="+request.mode+"\njob_id="+jobId+"\nkind="+request.kind+"\n");
  console.log("Request validated: "+jobId+" ("+request.mode+")");
}
main().catch(e=>{console.error("Request rejected: "+e.message);process.exitCode=1;});
