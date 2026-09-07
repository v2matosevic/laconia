#!/usr/bin/env node
// Opt-in subscription CLI comparison. Not part of npm test; no credentials read.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { commonVoice } from '../lib/voice.mjs';

const args = process.argv.slice(2);
const arg = (name) => args[args.indexOf(name) + 1];
for (const name of ['--claude', '--codex', '--old-voice', '--output']) {
  if (!args.includes(name) || !arg(name)) throw new Error(`Required: ${name}`);
}
const out = resolve(arg('--output')); mkdirSync(out, { recursive: true });
const old = readFileSync(arg('--old-voice'), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const voices = { old, new: commonVoice() };
const cases = [
  {id:'handoff',prompt:'Write the final update for a studio owner. Fixture facts: the reminder bug is fixed locally; the relevant tests passed; nothing was published or installed; customers still have the old version. State the outcome clearly. This is a writing exercise. Do not use tools or do any work.'},
  {id:'explanation',prompt:'Why can a shorter coding-agent reply be harder to understand? Explain to a studio owner using one concrete example. No software work has been performed and no next action is needed. This is a writing exercise; do not use tools.'},
  {id:'literal_json',prompt:'Return exactly this JSON object and nothing else: {"label":"Done — continue ✅","published":false}. Do not use tools.'},
];
const run = (exe, argv, input) => new Promise((resolveRun) => {
  const started = Date.now();
  const child = spawn(exe, argv, {cwd:out,env:{...process.env,LACONIA_HOME:join(out,'state')},windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
  child.on('error',e=>resolveRun({status:null,error:e.message,stdout,stderr,ms:Date.now()-started}));
  child.on('close',status=>resolveRun({status,stdout,stderr,ms:Date.now()-started}));
  child.stdin.end(input);
});
const results=[];
await Promise.all(['claude','codex'].map(async agent=>{
  for (const test of cases.filter((c) => !args.includes('--case') || c.id === arg('--case'))) for(const arm of test.id==='literal_json'||args.includes('--new-only')?['new']:['old','new']) {
    const voice=voices[arm];
    const argv=agent==='claude'
      ? ['--print','--safe-mode','--no-session-persistence','--output-format','json','--tools','','--append-system-prompt',voice]
      : ['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only',...(args.includes('--codex-model')?['--model',arg('--codex-model')]:[]),...(args.includes('--codex-effort')?['-c',`model_reasoning_effort=${JSON.stringify(arg('--codex-effort'))}`]:[]),'-c','features.hooks=false','-c','features.apps=false','-c','features.plugins=false','-c','project_doc_max_bytes=0','-c',`developer_instructions=${JSON.stringify(voice)}`,'--json','-'];
    const result=await run(arg('--'+agent),argv,test.prompt);
    const record={agent,case:test.id,arm,voiceHash:createHash('sha256').update(voice).digest('hex'),prompt:test.prompt,...result};
    results.push(record);writeFileSync(join(out,`${agent}-${test.id}-${arm}.json`),JSON.stringify(record,null,2)+'\n');
    console.log(`${agent} ${test.id} ${arm}: exit ${result.status}, ${result.ms}ms`);
    if(result.status!==0) break;
  }
}));
writeFileSync(join(out,'results.json'),JSON.stringify({created:new Date().toISOString(),limits:'Small synthetic sample, one response per arm. No blind rating or statistical quality claim. Agent core instructions retained; ambient customizations disabled for comparison.',results},null,2)+'\n');
process.exitCode=results.some(r=>r.status!==0)?1:0;
