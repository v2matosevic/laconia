#!/usr/bin/env node
/**
 * The linter. Deterministic check for AI-writing tells.
 *
 * No dependencies, no model call, no network. Give it text, get back violations
 * with positions and a score. Used by the Stop hook and by `laconia lint`.
 *
 * Every rule here is mechanical. Judgment rules (is this the right altitude? does
 * the reader need this detail?) deliberately live in the voice contract instead,
 * because a regex cannot decide them and a false positive is worse than a miss.
 */

// ---------------------------------------------------------------- config

export const DEFAULTS = {
  wordBudget: 150,          // soft: a normal turn-ending answer
  wordBudgetDepth: 600,     // soft: when depth was explicitly asked for
  maxBoldSpans: 2,
  boldPer100Words: 1.2,
  headerFreeUnder: 400,     // no markdown headers below this word count
};

// ------------------------------------------------------------- masking

/**
 * Blank out regions where a tell is legitimate: fenced code, inline code,
 * link targets, and quoted material (we quote the user verbatim). Replaced
 * with spaces so every offset stays true to the original string.
 */
function mask(src) {
  let s = src;
  const blank = (m) => ' '.repeat(m.length);

  // Explicit opt-out, for documenting bad writing on purpose:
  //   <!-- laconia-disable --> ... <!-- laconia-enable -->
  // A trailing note after the keyword is allowed, so the marker can say why.
  s = s.replace(
    /<!--\s*laconia-disable\b[\s\S]*?(?:<!--\s*laconia-enable\b[^]*?-->|$)/g,
    blank
  );

  s = s.replace(/```[\s\S]*?(?:```|$)/g, blank);   // fenced code
  s = s.replace(/~~~[\s\S]*?(?:~~~|$)/g, blank);   // alt fence
  s = s.replace(/`[^`\n]*`/g, blank);              // inline code
  s = s.replace(/\]\([^)\s]*\)/g, blank);          // markdown link targets
  s = s.replace(/https?:\/\/\S+/g, blank);         // bare urls
  s = s.replace(/^[ \t]*>.*$/gm, blank);           // blockquotes (quoted user)

  return s;
}

function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

// --------------------------------------------------------------- rules

/**
 * Pictographic emoji only. Deliberately NOT the arrow blocks: `→` is ordinary
 * technical punctuation and was 166 of ~200 hits when this rule was first
 * written against the real corpus. U+FE0F is a variation selector, not a glyph.
 */
const EMOJI = /(?!️)\p{Extended_Pictographic}/gu;

const AI_VOCAB = new RegExp(
  '\\b(?:delve|delves|delving|tapestry|testament|underscore[sd]?|underscoring|' +
  'showcas(?:e|es|ing)|robust|seamless(?:ly)?|holistic|leverage[sd]?|leveraging|' +
  'meticulous(?:ly)?|pivotal|intricate|intricacies|interplay|myriad|paramount|' +
  'crucial|foster(?:s|ing)?|garner(?:s|ed)?|bolster(?:s|ed)?|boasts|' +
  'streamlin(?:e|es|ed|ing)|comprehensive|nuanced|noteworthy|vibrant)\\b',
  'gi'
);

const NEG_PARALLEL =
  /\b(?:not just\b|not only\b|isn['’]t just\b|it['’]s not\b[^.\n]{0,70}?\bit['’]s\b)/gi;

const TRAILING_OFFER =
  /(?:want me to\b|would you like me to\b|shall i\b|let me know if\b|feel free to\b|do you want me to\b)/gi;

const HEDGE =
  /\b(?:it['’]s (?:important|worth) (?:to )?not(?:e|ing)|i hope this helps|in summary|to summarize)\b/gi;

/**
 * A list item that opens with a bold span: `- **Thing:** desc`,
 * `- **Thing** — desc`, `1. **Thing** is live`. The trailing colon is optional;
 * the tell is the bold-headed bullet itself, which is the shape LLM output is
 * most recognisable by. Measured in 26.3% of my own turn-ending answers.
 */
const INLINE_HEADER_BULLET =
  /^[ \t]*(?:[-*•]|\d+[.)])[ \t]+\*\*[^*\n]{1,80}\*\*/gm;

const MD_HEADER = /^[ \t]{0,3}#{1,6}[ \t]+\S/gm;
const MD_TABLE = /^[ \t]{0,3}\|.*\|[ \t]*$/gm;
const BOLD_SPAN = /\*\*[^*\n]+\*\*/g;
const EM_DASH = /—/g;
const HORIZ_RULE = /^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm;

// --------------------------------------------------------------- engine

function collect(masked, re, rule, severity, message, cap = 40) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(masked)) !== null && out.length < cap) {
    out.push({ rule, severity, message, index: m.index, match: m[0].slice(0, 60) });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

export function lint(text, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const masked = mask(text);
  const wc = words(masked);
  const v = [];

  // --- hard: mechanical, zero false positives once code is masked -------
  v.push(...collect(masked, EM_DASH, 'em-dash', 'hard',
    'Em dash. Use a comma, a full stop, or a colon.'));

  v.push(...collect(masked, EMOJI, 'emoji', 'hard',
    'Emoji used as formatting.'));

  v.push(...collect(masked, INLINE_HEADER_BULLET, 'inline-header-bullet', 'hard',
    'Bullet with a bold inline header. This is the single most recognisable AI shape. Write it as a sentence.'));

  // --- soft: judgment, logged and reported, not blocked by default ------
  const bold = collect(masked, BOLD_SPAN, 'bold', 'soft', '');
  const boldAllowed = Math.max(cfg.maxBoldSpans,
    Math.floor((wc / 100) * cfg.boldPer100Words));
  if (bold.length > boldAllowed) {
    v.push({
      rule: 'bold-density', severity: 'soft', index: bold[boldAllowed].index,
      match: bold[boldAllowed].match,
      message: `${bold.length} bold spans in ${wc} words (budget ${boldAllowed}). Bold marks a decision, not a topic.`,
    });
  }

  if (wc < cfg.headerFreeUnder) {
    const h = collect(masked, MD_HEADER, 'header-in-short-reply', 'soft',
      `Markdown header in a ${wc}-word reply. Headers are for documents, not messages.`);
    if (h.length) v.push(h[0]);
  }

  const tbl = collect(masked, MD_TABLE, 'table', 'soft',
    'Markdown table in a chat reply. Two sentences usually beat a grid.');
  if (tbl.length >= 2) v.push(tbl[0]);

  const hr = collect(masked, HORIZ_RULE, 'horizontal-rule', 'soft',
    'Horizontal rule. A reply is not a document.');
  if (hr.length) v.push(hr[0]);

  v.push(...collect(masked, NEG_PARALLEL, 'negative-parallelism', 'soft',
    'Negative parallelism ("not just X but Y"). Say the positive thing once.', 6));

  v.push(...collect(masked, TRAILING_OFFER, 'trailing-offer', 'soft',
    'Trailing offer. Either do it or name the decision plainly.', 4));

  v.push(...collect(masked, HEDGE, 'hedge', 'soft', 'Filler phrase.', 4));

  v.push(...collect(masked, AI_VOCAB, 'ai-vocab', 'soft',
    'Word from the AI-vocabulary list.', 8));

  const budget = opts.depthRequested ? cfg.wordBudgetDepth : cfg.wordBudget;
  if (wc > budget) {
    v.push({
      rule: 'length', severity: 'soft', index: 0, match: '',
      message: `${wc} words against a ${budget}-word budget${opts.depthRequested ? ' (depth was asked for)' : ''}.`,
    });
  }

  for (const x of v) x.line = lineOf(text, x.index);
  v.sort((a, b) => a.index - b.index);

  const hard = v.filter((x) => x.severity === 'hard');
  const soft = v.filter((x) => x.severity === 'soft');

  return {
    words: wc,
    violations: v,
    hard,
    soft,
    score: score(v, wc),
    counts: v.reduce((a, x) => ((a[x.rule] = (a[x.rule] || 0) + 1), a), {}),
    clean: hard.length === 0 && soft.length === 0,
  };
}

/** 0 = clean. Roughly comparable to the 21 Aug 2026 baseline of 42.8 mean. */
function score(v, wc) {
  const n = (rule) => v.filter((x) => x.rule === rule).length;
  const per100 = (rule) => (100 * n(rule)) / Math.max(1, wc);
  let s = 0;
  s += Math.min(30, per100('em-dash') * 12);
  s += Math.min(20, n('bold-density') ? 12 : 0);
  s += Math.min(15, n('inline-header-bullet') * 4);
  s += Math.min(10, n('header-in-short-reply') * 6);
  s += Math.min(10, n('emoji') * 3);
  s += Math.min(10, n('negative-parallelism') * 4);
  s += Math.min(10, per100('ai-vocab') * 8);
  s += Math.min(10, n('trailing-offer') * 5);
  s += Math.min(15, Math.max(0, wc - 150) / 40);
  return Math.round(s * 10) / 10;
}
