// Fake Claude Agent SDK for adapter tests. No network or model calls.
// FAKE_SDK_MODE=budget ends with error_max_budget_usd; FAKE_SDK_MODE=throw throws after two turns.
import fs from 'node:fs';
import path from 'node:path';

export async function* query({ options }) {
  const pre = options.hooks.PreToolUse[0].hooks[0];
  const post = options.hooks.PostToolUse[0].hooks[0];
  const assistant = (usage, content) => ({ type: 'assistant', message: { model: 'fake-model', usage, content, stop_reason: 'tool_use' } });

  yield assistant({ input_tokens: 1200, cache_creation_input_tokens: 18000, cache_read_input_tokens: 0, output_tokens: 150 },
    [{ type: 'tool_use', name: 'Bash', input: { command: 'git status --short' } }]);
  await pre({ tool_name: 'Bash', tool_input: { command: 'git status --short' } });
  await post({ tool_name: 'Bash', tool_response: 'exit code: 0' });

  const target = path.join(options.cwd, 'widget.js');
  yield assistant({ input_tokens: 900, cache_creation_input_tokens: 4000, cache_read_input_tokens: 18000, output_tokens: 600 },
    [{ type: 'text', text: 'Editing widget.js. This is vanilla browser JavaScript with no runtime version declared.' }, { type: 'tool_use', name: 'Edit', input: { file_path: target } }]);
  await pre({ tool_name: 'Edit', tool_input: { file_path: target } });
  fs.appendFileSync(target, '\n// partial edit by fake SDK\n');
  await post({ tool_name: 'Edit', tool_response: 'ok' });

  if (process.env.FAKE_SDK_MODE === 'throw') throw new Error('fake transport failure');
  yield { type: 'result', subtype: 'error_max_budget_usd', num_turns: 2, total_cost_usd: 0.42, usage: { input_tokens: 2100, output_tokens: 750 } };
}
