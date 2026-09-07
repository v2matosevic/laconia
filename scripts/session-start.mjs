#!/usr/bin/env node
// Supported lifecycle context; never replace the agent's base instructions.
import { readFileSync } from 'node:fs';
import { composeVoice, localVoice } from '../lib/voice.mjs';
import { resolveAgent } from '../lib/agent.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const agent = resolveAgent(input);
  const text = agent === 'codex' ? composeVoice() : localVoice();
  if (text) process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Laconia communication preferences. Apply to prose; preserve the user's requested format and all coding, safety and permission instructions.\n\n${text}`,
    },
  }) + '\n');
} catch { /* Optional writing preferences must never block session startup. */ }
