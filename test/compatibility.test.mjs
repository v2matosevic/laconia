import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, root } from './helpers.mjs';
import { lint } from '../lib/lint.mjs';
import { parseTranscript } from '../lib/audit.mjs';
import { buildReport } from '../lib/report.mjs';
import { requestContext, lastTranscriptModel } from '../lib/transcripts.mjs';
import { resolveAgent } from '../lib/agent.mjs';
import { effectiveConfigJson } from '../lib/config.mjs';

test('effective budgets have zero score when allowed; disabled rules do not score', () => {
  for (const opts of [{ depthRequested: true }, { wordBudget: 500 }, { disabledRules: ['length'] }]) {
    assert.equal(lint('word '.repeat(300), opts).score, 0);
  }
});
test('copyright/trademark symbols pass; decorative emoji still match', () => {
  assert.equal(lint('Copyright © 2026, Acme® and Product™.').hard.length, 0);
  assert.ok(lint('Done ✅').hard.length);
  assert.ok(lint('Warning ⚠️').hard.length);
});
test('matching fences protect code and preserve following line positions', () => {
  const text = '````md\n```js\nconst x = "a — b";\n```\n````\nBad — prose.';
  assert.equal(lint(text).hard.length, 1);
  assert.equal(lint(text).hard[0].line, 6);
  assert.equal(lint('~~~~~\n~~~\na — b\n~~~\n~~~~~').hard.length, 0);
  assert.equal(lint('Run ``the `a — b` command``.').hard.length, 0);
});
test('literal quotations, JSON and explicit structured output remain unchanged', () => {
  assert.equal(lint('The button says “Done — continue”.').hard.length, 0);
  assert.equal(lint('{"status":"Done — continue ✅"}').format, 'structured');
  assert.equal(lint('status: Done — continue', { format: 'structured' }).hard.length, 0);
});
test('documents have no chat length or layout penalties', () => {
  const r = lint('## Title\n\n| A | B |\n|---|---|\n' + 'word '.repeat(900), { format: 'document' });
  assert.equal(r.score, 0);
  assert.ok(!r.counts.length && !r.counts.table);
});
test('CLI shares user config and parses valued flags before file paths', (t) => {
  const f = fixture(t, { lint: { wordBudget: 10 } });
  const path = join(f.dir, 'draft.md'); writeFileSync(path, 'word '.repeat(60));
  const r = f.cli('lint', '--format', 'chat', path, '--json');
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).counts.length, 1);
  assert.equal(JSON.parse(f.cli('lint', '--text', 'word '.repeat(60), '--json').stdout).counts.length, 1);
});
test('malformed and invalid config never turn advisory into blocking', (t) => {
  const f = fixture(t);
  for (const body of ['{broken', '{"mode":"blok"}', '{"mode":"block","lint":{"wordBudget":-1}}', '{"mode":"block","blockRules":"emoji"}']) {
    writeFileSync(join(f.env.LACONIA_HOME, 'config.json'), body);
    const r = f.hook({ session_id: 'bad-config', last_assistant_message: 'Bad — prose.' });
    assert.equal(r.status, 0); assert.equal(r.stdout, '');
    assert.match(f.cli('check').stdout, /advisory fallback/);
  }
});
test('corrections are logged, never reblocked; duplicate turn hooks are deduplicated', (t) => {
  const f = fixture(t, { mode: 'block' });
  const input = { session_id: 'one', turn_id: 'turn', last_assistant_message: 'Bad — prose.' };
  assert.equal(JSON.parse(f.hook(input).stdout).decision, 'block');
  assert.equal(f.hook(input).stdout, '');
  assert.equal(f.hook({ ...input, stop_hook_active: true }).stdout, '');
  const rows = readFileSync(join(f.env.LACONIA_HOME, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 2); assert.equal(rows[1].correction, true);
  assert.equal(rows[0].scoreVersion, 2); assert.ok(rows[0].voiceHash);
});
test('circuit breaker allows zero requests and caps each session independently', (t) => {
  const f = fixture(t, { mode: 'block', circuitBreaker: { maxBlocksPerSession: 1 } });
  const input = { last_assistant_message: 'Bad — prose.' };
  assert.ok(f.hook({ ...input, session_id: 'a' }).stdout);
  assert.equal(f.hook({ ...input, session_id: 'a' }).stdout, '');
  assert.ok(f.hook({ ...input, session_id: 'b' }).stdout);
  writeFileSync(join(f.env.LACONIA_HOME, 'config.json'), JSON.stringify({mode:'block',circuitBreaker:{maxBlocksPerSession:0}}));
  assert.equal(f.hook({ ...input, session_id: 'c' }).stdout, '');
});
test('personal hook strips whole comments and preserves coding boundaries', (t) => {
  const f = fixture(t); writeFileSync(join(f.env.LACONIA_HOME, 'voice.local.md'), '<!--\nprivate comment\n-->\nUse natural Croatian.');
  for (const agent of ['claude','codex']) {
    const r = f.run('scripts/session-start.mjs', ['--agent', agent], {});
    const text = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(text, /Use natural Croatian/); assert.doesNotMatch(text, /private comment|-->/);
    assert.match(text, /permission instructions/);
    if (agent === 'codex') assert.match(text, /Answer the user's actual request/);
  }
});
test('install is idempotent, preserves peer hooks and prose, uninstall preserves sources', (t) => {
  const f = fixture(t);
  const hp = join(f.env.CODEX_HOME,'hooks.json'), ap = join(f.env.CODEX_HOME,'AGENTS.md');
  const peer = {type:'command',command:'node peer.mjs'};
  writeFileSync(hp, JSON.stringify({hooks:{Stop:[{hooks:[peer, {type:'command',command:'old', 'x-laconia':true}]}]}}));
  const original = '  Preserve this.\n\n\nOther rules.\n'; writeFileSync(ap,original);
  writeFileSync(join(f.env.LACONIA_HOME,'voice.local.md'),'<!--\nhidden\n-->\nNatural Croatian.');
  assert.equal(f.cli('install').status,0);
  const agents = readFileSync(ap,'utf8'), hooks = readFileSync(hp,'utf8');
  assert.ok(agents.startsWith(original)); assert.match(agents,/Natural Croatian/); assert.doesNotMatch(agents,/hidden/);
  assert.equal(f.cli('install').status,0);
  assert.equal(readFileSync(ap,'utf8'),agents); assert.equal(readFileSync(hp,'utf8'),hooks);
  assert.match(f.cli('check').stdout,/matches current source/);
  assert.equal(f.cli('uninstall').status,0);
  assert.deepEqual(JSON.parse(readFileSync(hp,'utf8')).hooks.Stop[0].hooks,[peer]);
  assert.ok(readFileSync(ap,'utf8').startsWith(original));
  assert.ok(existsSync(join(f.env.CLAUDE_CONFIG_DIR,'skills/laconia/package.json')));
  assert.equal(JSON.parse(readFileSync(join(f.env.CLAUDE_CONFIG_DIR,'settings.json'))).enabledPlugins['laconia@skills-dir'],false);
});
test('malformed shared config or managed markers abort before installation writes', (t) => {
  for (const bad of ['json','markers','shape']) {
    const f=fixture(t); const hp=join(f.env.CODEX_HOME,'hooks.json');
    writeFileSync(hp,bad==='json'?'broken':bad==='shape'?'{}':'{}');
    if(bad==='shape')writeFileSync(hp,'{"hooks":{"Stop":{}}}');
    if(bad==='markers')writeFileSync(join(f.env.CODEX_HOME,'AGENTS.md'),'<!-- laconia:start --> broken');
    assert.equal(f.cli('install').status,1);
    assert.ok(!existsSync(join(f.env.CLAUDE_CONFIG_DIR,'skills')));
  }
});
test('Codex-only installer exposes a skill without installing Claude', (t) => {
  const f=fixture(t); assert.equal(f.cli('install','--agent','codex').status,0);
  assert.ok(existsSync(join(f.env.CODEX_HOME,'skills/laconia/SKILL.md')));
  assert.ok(!existsSync(join(f.env.CLAUDE_CONFIG_DIR,'skills')));
});
test('report comparisons are disjoint and cannot mix agents or versions', () => {
  const now=Date.parse('2026-09-08T00:00:00Z');
  const make=(days,extra={})=>({ts:new Date(now-days*864e5).toISOString(),words:30,score:0,agent:'codex',requestClass:'routine',model:'test',version:'1.1.0',voiceHash:'a',configHash:'a',scoreVersion:2,...extra});
  const rows=[...Array.from({length:10},()=>make(2)),...Array.from({length:10},()=>make(9))];
  assert.equal(buildReport(rows,{now,days:7}).groups[0].comparable,true);
  for(const extra of [{agent:'claude'},{voiceHash:'b'},{configHash:'b'},{scoreVersion:1},{requestClass:'depth'}]) {
    const report=buildReport([...rows.slice(0,10),...Array.from({length:10},()=>make(9,extra))],{now,days:7});
    assert.equal(report.groups[0].comparable,false);
  }
});
test('transcript readers retain depth requests and exclude tool narration', () => {
  const raw=[{type:'user',message:{content:'Explain why this failed.'}},{type:'assistant',message:{content:[{type:'text',text:'Checking now.'}]}},{type:'assistant',message:{content:[{type:'tool_use',name:'Read'}]}},{type:'user',message:{content:[{type:'tool_result',content:'ok'}]}},{type:'assistant',message:{content:[{type:'text',text:'The input was empty.'}],stop_reason:'end_turn'}}].map(JSON.stringify).join('\n');
  const records=parseTranscript(raw,'claude'); assert.equal(records.length,1); assert.equal(records[0].requestClass,'depth');
  const modern=[{type:'event_msg',payload:{type:'user_message',message:'Explain why.'}},{type:'response_item',payload:{role:'assistant',channel:'final',content:[{type:'output_text',text:'Because input was empty.'}]}},{type:'event_msg',payload:{type:'task_complete',last_agent_message:'Because input was empty.'}}].map(JSON.stringify).join('\n');
  assert.equal(parseTranscript(modern,'codex').length,1);
  assert.equal(requestContext('Objasni detaljno.').depthRequested,true);
});
test('native packages expose real skills and preserve Claude coding instructions', () => {
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']) {
    const pkg=JSON.parse(readFileSync(join(root,file)));
    assert.ok(existsSync(join(root,pkg.skills,'laconia/SKILL.md')));
  }
  assert.match(readFileSync(join(root,'output-styles/laconia.md'),'utf8'),/keep-coding-instructions: true/);
});
test('shared plugin hooks detect the host and explicit CLI wiring wins', () => {
  assert.equal(resolveAgent({}, [], {PLUGIN_ROOT:'/plugin'}),'codex');
  assert.equal(resolveAgent({}, [], {CLAUDE_PLUGIN_ROOT:'/plugin'}),'claude');
  assert.equal(resolveAgent({turn_id:'one'}, [], {}),'codex');
  assert.equal(resolveAgent({turn_id:'one'}, ['--agent','claude'], {PLUGIN_ROOT:'/plugin'}),'claude');
});
test('every scored advisory has a nonzero score', () => {
  for(const text of ['In summary, done.','---\n\nDone.','| A | B |\n|---|---|']) {
    const r=lint(text); assert.ok(r.violations.length); assert.ok(r.score>0);
  }
});
test('effective config identity ignores comments and property ordering', () => {
  assert.equal(effectiveConfigJson({mode:'advisory',lint:{wordBudget:100},$comment:'a'}),effectiveConfigJson({$comment:'b',lint:{$comment:'c',wordBudget:100},mode:'advisory'}));
});
test('normal transcript model metadata is available without logging content', (t) => {
  const f=fixture(t), path=join(f.dir,'transcript.jsonl');
  for (const record of [{type:'assistant',message:{model:'claude-test'}},{type:'turn_context',payload:{model:'codex-test'}}]) {
    writeFileSync(path,JSON.stringify(record)+'\n');
    assert.equal(lastTranscriptModel(path), record.message?.model || record.payload.model);
  }
});
test('local links with spaces and nested parentheses preserve their targets', () => {
  assert.equal(lint('See [report](<C:/My Reports/a—b.md>) and [source](https://x.test/a(b)—c).').hard.length,0);
  assert.equal(lint('See [bad — label](<C:/My Reports/a—b.md>).').hard.length,1);
});
