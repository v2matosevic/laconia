import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VOICE_PATH, LOCAL_VOICE_PATH } from './paths.mjs';

export function stripComments(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim();
}
export function commonVoice() {
  return readFileSync(VOICE_PATH, 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/^\s*# Output Style:.*\r?\n/, '').trim();
}
export function localVoice() {
  try { return stripComments(readFileSync(LOCAL_VOICE_PATH, 'utf8')); }
  catch { return ''; }
}
export function composeVoice() {
  const local = localVoice();
  return commonVoice() + (local ? `\n\n## Personal preferences\n\n${local}` : '');
}
export function voiceHash() {
  return createHash('sha256').update(composeVoice()).digest('hex').slice(0, 16);
}
