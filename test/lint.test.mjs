import test from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../lib/lint.mjs';

const rules = (text, opts) => lint(text, opts).violations.map((v) => v.rule);
const hard = (text, opts) => lint(text, opts).hard.map((v) => v.rule);

test('clean prose is clean', () => {
  const r = lint('The deploy is green. Nothing for you to do.');
  assert.equal(r.clean, true);
  assert.equal(r.score, 0);
  assert.equal(r.hard.length, 0);
});

test('em dash is a hard violation', () => {
  assert.ok(hard('Fixed — and deployed.').includes('em-dash'));
});

test('en dash and hyphen are not em dashes', () => {
  assert.equal(hard('Pages 3–5 use a well-known trick.').length, 0);
});

// ---------------------------------------------------------------- masking

test('em dash inside a fenced code block does not count', () => {
  const t = 'Here is the fix.\n\n```js\nconst s = "a — b";\n```\n\nDone.';
  assert.equal(hard(t).length, 0);
});

test('em dash inside inline code does not count', () => {
  assert.equal(hard('Run `foo — bar` to reproduce.').length, 0);
});

test('em dash inside a blockquote does not count', () => {
  assert.equal(hard('You said:\n\n> ship it — now\n\nDone.').length, 0);
});

test('em dash in a URL or link target does not count', () => {
  assert.equal(hard('See [the docs](https://x.test/a—b) for more.').length, 0);
});

test('an unterminated code fence still masks to end of text', () => {
  assert.equal(hard('Output:\n\n```\na — b\n').length, 0);
});

test('violation offsets survive masking', () => {
  const t = 'line one\nline two\nbad — here';
  const v = lint(t).violations.find((x) => x.rule === 'em-dash');
  assert.equal(v.line, 3);
});

// ------------------------------------------------------- structural tells

test('bullet opening with a bold span is hard, colon or not', () => {
  assert.ok(hard('- **Thing:** description').includes('inline-header-bullet'));
  assert.ok(hard('- **Thing** is live and working').includes('inline-header-bullet'));
  assert.ok(hard('1. **Thing** — description').includes('inline-header-bullet'));
});

test('an ordinary bullet is fine', () => {
  assert.equal(hard('- ran the tests\n- pushed the branch').length, 0);
});

test('bold mid-sentence in a bullet is not a bold-headed bullet', () => {
  assert.equal(hard('- the test suite is **green** now').length, 0);
});

// --------------------------------------------------------------- emoji

test('pictographic emoji is a hard violation', () => {
  assert.ok(hard('Shipped ✅ all good').includes('emoji'));
  assert.ok(hard('🎉 done').includes('emoji'));
});

test('arrows are punctuation, not emoji', () => {
  // Regression: the first emoji rule used the arrow blocks and flagged 41.8% of
  // a real corpus, of which 166 of ~200 hits were a plain right arrow.
  assert.equal(hard('Flow: a → b → c.').length, 0);
  assert.equal(hard('Renamed foo ← bar.').length, 0);
});

test('a variation selector alone is not an emoji', () => {
  assert.equal(hard('plain text️ here').length, 0);
});

// ----------------------------------------------------------------- soft

test('bold density trips over budget and not under', () => {
  assert.ok(rules('**a** **b** **c** **d** short text').includes('bold-density'));
  assert.ok(!rules('**a** short text').includes('bold-density'));
});

test('headers trip in a short reply only', () => {
  assert.ok(rules('## Summary\n\nshort reply').includes('header-in-short-reply'));
  const long = '## Summary\n\n' + 'word '.repeat(500);
  assert.ok(!rules(long).includes('header-in-short-reply'));
});

test('length budget respects a depth request', () => {
  const long = 'word '.repeat(300);
  assert.ok(rules(long).includes('length'));
  assert.ok(!rules(long, { depthRequested: true }).includes('length'));
});

test('trailing offers and negative parallelism are soft, not hard', () => {
  const r = lint('This is not just faster, but cleaner. Want me to push it?');
  assert.ok(r.soft.some((v) => v.rule === 'negative-parallelism'));
  assert.ok(r.soft.some((v) => v.rule === 'trailing-offer'));
  assert.equal(r.hard.length, 0);
});

test('AI vocabulary is detected', () => {
  assert.ok(rules('A robust and comprehensive solution.').includes('ai-vocab'));
});

// ---------------------------------------------------------------- scoring

test('score rises with slop and floors at zero', () => {
  const clean = lint('Deployed. Nothing to do.').score;
  const dirty = lint('**Done** — shipped — verified — green.\n\n- **A:** x\n- **B:** y').score;
  assert.equal(clean, 0);
  assert.ok(dirty > 20, `expected a high score, got ${dirty}`);
});

test('empty input does not throw', () => {
  assert.doesNotThrow(() => lint(''));
  assert.equal(lint('').clean, true);
});

test('counts are keyed by rule', () => {
  const r = lint('a — b — c');
  assert.equal(r.counts['em-dash'], 2);
});

test('config overrides are honoured', () => {
  const t = 'word '.repeat(60);
  assert.ok(!rules(t, { wordBudget: 500 }).includes('length'));
  assert.ok(rules(t, { wordBudget: 10 }).includes('length'));
});

// -------------------------------------------------------------- opt-out

test('laconia-disable blocks suppress violations', async () => {
  const t = 'clean line\n\n<!-- laconia-disable -->\nbad — line with **A:** stuff\n<!-- laconia-enable -->\n\nalso clean';
  const { lint: l } = await import('../lib/lint.mjs');
  assert.equal(l(t).hard.length, 0);
});

test('an unclosed laconia-disable suppresses to end of file', async () => {
  const { lint: l } = await import('../lib/lint.mjs');
  assert.equal(l('ok\n<!-- laconia-disable -->\nbad — here').hard.length, 0);
});

test('violations outside the block still fire', async () => {
  const { lint: l } = await import('../lib/lint.mjs');
  const t = 'bad — one\n<!-- laconia-disable -->\nbad — two\n<!-- laconia-enable -->';
  assert.equal(l(t).counts['em-dash'], 1);
});
