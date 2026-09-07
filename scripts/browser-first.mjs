#!/usr/bin/env node
/**
 * PreToolUse gate on WebFetch and WebSearch. Off by default.
 *
 * This one is an opinion, not a writing rule, so it ships disabled. Turn it on
 * with `browserFirst.enabled: true` in ~/.laconia/config.json if you would
 * rather your agent drive a real browser than read a summary.
 *
 * Claude Code only. Codex's web search is a hosted tool that hooks cannot reach.
 */

import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';

const exitQuietly = () => process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  exitQuietly();
}

let cfg;
try {
  cfg = loadConfig();
} catch {
  exitQuietly();
}

const bf = cfg.browserFirst || {};
if (!bf.enabled) exitQuietly();

const tool = input.tool_name;
const isFetch = tool === 'WebFetch';
const isSearch = tool === 'WebSearch';
if (!isFetch && !isSearch) exitQuietly();
if (isFetch && bf.denyWebFetch === false) exitQuietly();
if (isSearch && bf.denyWebSearch === false) exitQuietly();

const reason = 'Laconia browserFirst is enabled in your local settings. Use an available real browser to open ' +
  (isFetch ? (input.tool_input?.url || 'the requested page') : 'a search engine for the requested query') +
  '. If no browser is available, state that limitation. This restriction is a user preference, separate from writing quality.';

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
process.exit(0);
