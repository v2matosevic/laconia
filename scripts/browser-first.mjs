#!/usr/bin/env node
/**
 * PreToolUse gate on WebFetch and WebSearch.
 *
 * Marko has asked for browser-based research six separate times (25 Jul,
 * 3 Aug, 4 Aug x2, 20 Aug x2). The rule is in his global CLAUDE.md and in a
 * memory note whose own text reads "the repeat is the finding", and it was
 * still broken in the first tool call of the session where Laconia was designed.
 *
 * That is the whole argument for this plugin in one rule: a reflex has to be
 * blocked, not reminded. So this denies the call instead of asking nicely.
 *
 * His stated reason on 20 Aug was new and covers search as well as fetch: sites
 * reject the fetcher outright, so only a real browser loads a complete page.
 * Searching is done in the browser too.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = () => process.exit(0);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  ok();
}

let cfg = {};
try {
  cfg = JSON.parse(readFileSync(join(ROOT, 'laconia.config.json'), 'utf8'));
} catch { /* defaults */ }

const bf = cfg.browserFirst || {};
if (bf.enabled === false) ok();

const tool = input.tool_name;
const isFetch = tool === 'WebFetch';
const isSearch = tool === 'WebSearch';
if (!isFetch && !isSearch) ok();
if (isFetch && bf.denyWebFetch === false) ok();
if (isSearch && bf.denyWebSearch === false) ok();

const target = isFetch
  ? (input.tool_input?.url || 'that page')
  : JSON.stringify(input.tool_input?.query || '');

const common = [
  '',
  'Playwright MCP (browser_navigate, then browser_take_screenshot with fullPage,',
  'or browser_evaluate to pull exact strings out of the DOM) or Claude in Chrome',
  'for anything behind his login.',
  '',
  'If no browser is reachable in this session, say that plainly rather than',
  'answering from memory or from a summary.',
];

const reason = (isFetch
  ? [
      `Laconia: WebFetch is off. Open ${target} in a real browser instead.`,
      '',
      "WebFetch hands back a small model's summary of a stripped page. It loses",
      'code blocks, tables and JS-rendered content, and it fails quietly by',
      'returning fluent prose with none of the data in it.',
    ]
  : [
      `Laconia: WebSearch is off. Run that search ${target} in a real browser.`,
      '',
      'Navigate to the search engine and read the results page. Marko asked for',
      'this specifically: sites reject the fetcher outright, so a real browser is',
      'the only thing that loads a complete page. A WebSearch summary is not',
      'evidence and must never be quoted as the finding.',
    ]
).concat(common).join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
}) + '\n');
process.exit(0);
