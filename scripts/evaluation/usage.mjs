// Summarizes Claude Agent SDK messages into per-turn token usage and run totals.
// Unknown values stay null, never 0, so missing telemetry is never mistaken for zero cost.

const TOKEN_FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
const numberOrNull = (value) => (Number.isFinite(value) ? value : null);

export function runStatus({ subtype = null, error = null } = {}) {
  if (error) return /budget/i.test(String(error?.message ?? error)) ? 'BUDGET_EXHAUSTED' : 'ERROR';
  if (subtype === 'success') return 'COMPLETED';
  if (subtype === 'error_max_budget_usd') return 'BUDGET_EXHAUSTED';
  if (subtype === 'error_max_turns') return 'MAX_TURNS';
  return subtype ? 'ERROR' : 'INCOMPLETE';
}

export function summarizeMessages(messages = []) {
  const turns = [];
  let result = null;
  let model = null;
  for (const msg of messages) {
    if (msg?.type === 'assistant' && msg.message) {
      const usage = msg.message.usage ?? {};
      model = msg.message.model ?? model;
      const content = Array.isArray(msg.message.content) ? msg.message.content : [];
      turns.push({
        turn: turns.length + 1,
        ...Object.fromEntries(TOKEN_FIELDS.map((field) => [field, numberOrNull(usage[field])])),
        tools: content.filter((block) => block.type === 'tool_use').map((block) => block.name),
        stop_reason: msg.message.stop_reason ?? null,
      });
    }
    if (msg?.type === 'result') result = msg;
  }
  const totals = Object.fromEntries(TOKEN_FIELDS.map((field) => [
    field,
    turns.length && turns.every((turn) => turn[field] !== null) ? turns.reduce((sum, turn) => sum + turn[field], 0) : null,
  ]));
  const cost = numberOrNull(result?.total_cost_usd ?? result?.totalCostUsd);
  return {
    model,
    num_turns: numberOrNull(result?.num_turns) ?? turns.length,
    subtype: result?.subtype ?? null,
    total_cost_usd: cost,
    cost_per_turn_usd: cost !== null && turns.length ? Number((cost / turns.length).toFixed(6)) : null,
    totals,
    largest_input_turn: turns.reduce((max, turn) => {
      const size = (turn.input_tokens ?? 0) + (turn.cache_creation_input_tokens ?? 0) + (turn.cache_read_input_tokens ?? 0);
      return size > (max?.size ?? -1) ? { turn: turn.turn, size } : max;
    }, null),
    turns,
  };
}

export function formatTurn(turn) {
  const input = (turn.input_tokens ?? 0) + (turn.cache_creation_input_tokens ?? 0) + (turn.cache_read_input_tokens ?? 0);
  return `turn ${turn.turn}: input ${input} (cache read ${turn.cache_read_input_tokens ?? '?'}, cache write ${turn.cache_creation_input_tokens ?? '?'}), output ${turn.output_tokens ?? '?'}, tools ${turn.tools.join(',') || '-'}`;
}
