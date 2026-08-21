#!/usr/bin/env node
/**
 * PreToolUse gate on WebFetch and WebSearch. Off by default.
 *
 * This one is an opinion, not a writing rule, so it ships disabled. Turn it on
 * with `browserFirst.enabled: true` in ~/.laconia/config.json if you would
 * rather your agent drive a real browser than read a summary.
 *
 * The argument: WebFetch hands back a small model's summary of a page stripped
 * to markdown. It loses code blocks, tables and anything JavaScript rendered,
 * and it fails quietly, returning fluent prose with none of the data in it. A
 * browser (Playwright MCP, Claude in Chrome) loads the actual page.
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

const tail = [
  '',
  'Use Playwright MCP (browser_navigate, then browser_take_screenshot with',
  'fullPage, or browser_evaluate to pull exact strings out of the DOM) or Claude',
  'in Chrome for anything behind a login.',
  '',
  'If no browser is reachable in this session, say so plainly rather than',
  'answering from a summary or from memory.',
];

const head = isFetch
  ? [
      `Laconia: WebFetch is off. Open ${input.tool_input?.url || 'that page'} in a real browser.`,
      '',
      "WebFetch returns a small model's summary of a stripped page. It loses code",
      'blocks, tables and JS-rendered content, and it fails quietly.',
    ]
  : [
      `Laconia: WebSearch is off. Run ${JSON.stringify(input.tool_input?.query || '')} in a real browser.`,
      '',
      'Navigate to the search engine and read the results page. A search summary is',
      'not evidence and must not be quoted as the finding.',
    ];

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: head.concat(tail).join('\n'),
  },
}) + '\n');
process.exit(0);
