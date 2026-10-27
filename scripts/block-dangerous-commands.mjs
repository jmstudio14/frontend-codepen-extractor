#!/usr/bin/env node
/**
 * Optional Claude Code PreToolUse hook.
 * Reads hook JSON from stdin and emits a structured deny for a small set of
 * high-risk command patterns. This is defense-in-depth, NOT a security sandbox.
 */
import fs from 'node:fs';
import process, { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const BLOCK_RULES = [
  { name: 'recursive-force-delete', re: /\brm\s+(?:(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)(?:\s|$)|--recursive\s+--force|--force\s+--recursive)/i },
  { name: 'git-hard-reset', re: /\bgit\s+reset\s+--hard(?:\s|$)/i },
  { name: 'git-clean-force', re: /\bgit\s+clean\b[^\n]*(?:\s-(?![a-z]*n)[a-z]*f[a-z]*|--force)(?:\s|$)/i },
  { name: 'git-discard-worktree', re: /\bgit\s+(?:checkout\s+--\s+\.|restore\s+(?:--worktree\s+)?--source=HEAD\s+\.|restore\s+--worktree\s+\.)(?:\s|$)/i },
  { name: 'forced-git-push', re: /\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?(?:\s|$)|\s-f(?:\s|$))/i },
  { name: 'package-publish', re: /\b(?:npm|pnpm|yarn)\s+publish\b/i },
  { name: 'powershell-recursive-delete', re: /\b(?:Remove-Item|ri|del|erase)\b[^\n]*(?:-Recurse|-r\b|-Force|-fo\b|\/s\b|\/q\b)/i },
  { name: 'windows-format-command', re: /\bformat(?:\.com)?\s+[a-z]:/i },
  { name: 'windows-delete-tree', re: /\b(?:rd|rmdir)\b[^\n]*(?:\/s\b|\/q\b)/i },
];

export function classifyCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return null;
  for (const rule of BLOCK_RULES) {
    if (rule.re.test(command)) return rule.name;
  }
  return null;
}

async function readStdin() {
  let data = '';
  for await (const chunk of stdin) data += chunk;
  return data;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Fail open on malformed input: the hook is advisory and Claude Code's
    // permission system remains the primary control. Keep stdout clean.
    return;
  }

  const toolName = String(payload?.tool_name ?? '');
  if (!['Bash', 'PowerShell'].includes(toolName)) return;

  const command = payload?.tool_input?.command;
  const rule = classifyCommand(command);
  if (!rule) return;

  stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Blocked by optional command guard (${rule}). Review the command and perform sensitive/destructive operations manually if genuinely required.`,
    },
  }) + '\n');
}

// realpath on both sides so a symlinked or junction checkout still runs the hook.
function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}

if (isMainModule(import.meta.url)) {
  main().catch(() => {
    // Never print untrusted payloads. Hook failures should not leak input.
    process.exitCode = 0;
  });
}
