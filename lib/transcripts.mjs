import { existsSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';

export function lastTranscriptModel(path) {
  if (!path || !existsSync(path)) return null;
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size, len = Math.min(size, 512 * 1024), buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    for (const line of buf.toString('utf8').split('\n').reverse()) {
      let r; try { r = JSON.parse(line); } catch { continue; }
      const model = r.type === 'assistant' ? r.message?.model : r.type === 'turn_context' ? r.payload?.model : null;
      if (typeof model === 'string' && model) return model;
    }
  } catch {} finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
  return null;
}

/** Tail-read only: transcripts reach hundreds of megabytes. */
export function lastUserMessage(path) {
  if (!path || !existsSync(path)) return '';
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (!l.startsWith('{')) continue;
      let rec;
      try { rec = JSON.parse(l); } catch { continue; }

      // Claude Code shape
      if (rec.type === 'user' && !rec.isSidechain && !rec.isMeta) {
        const c = rec.message?.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
          if (c.some((b) => b?.type === 'tool_result')) continue;
          const t = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
          if (t.trim()) return t;
        }
      }

      // Codex shape
      if (rec.type === 'event_msg' && rec.payload?.type === 'user_message' && typeof rec.payload.message === 'string') return rec.payload.message;
      if (rec.type === 'response_item' && rec.payload?.role === 'user') {
        const t = (rec.payload.content || [])
          .filter((b) => b?.type === 'input_text' || b?.type === 'text')
          .map((b) => b.text || '').join('\n');
        if (t.trim() && !t.includes('<hook_prompt') && !t.startsWith('# AGENTS.md instructions') && !t.startsWith('<environment_context>')) return t;
      }
    }
  } catch { /* transcript format is not a stable interface; degrade quietly */ } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }
  return '';
}


export function requestContext(prompt) {
  if (!prompt?.trim()) return { depthRequested: null, requestClass: 'unknown' };
  if (/\b(briefly|keep it short|one sentence|ukratko|kratko)\b/i.test(prompt)) return { depthRequested: false, requestClass: 'brief' };
  const depthRequested = /\b(explain|why|walk me through|in detail|detailed|full picture|deep dive|audit|review|research|compare|options|how does|how do|teach|understand|objasni|objasnite|zašto|detaljno|usporedi|erkläre|warum|ausführlich)\b/i.test(prompt);
  return { depthRequested, requestClass: depthRequested ? 'depth' : 'routine' };
}
