// Codex exposes PLUGIN_ROOT and Claude exposes CLAUDE_PLUGIN_ROOT. Codex also
// supplies turn_id on turn events. Explicit CLI wiring always wins.
export function resolveAgent(input = {}, argv = process.argv, env = process.env) {
  const i = argv.indexOf('--agent');
  const explicit = i >= 0 ? argv[i + 1] : null;
  if (explicit === 'codex' || explicit === 'claude') return explicit;
  return env.PLUGIN_ROOT || Object.hasOwn(input, 'turn_id') ? 'codex' : 'claude';
}
