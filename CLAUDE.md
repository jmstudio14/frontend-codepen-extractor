# Repository instructions

## Coding and component extraction
For coding tasks across languages and frameworks, use the `frontend-codepen-extractor` subagent and its skill at `.claude/skills/frontend-codepen-extractor/SKILL.md`. Detect the target stack from repository evidence and read `.claude/skills/frontend-codepen-extractor/references/multilanguage-engineering.md` for non-web programming. For CodePen/UIverse/CodeMyUI component work, retain progressive discovery and source-provenance requirements.

## Engineering rules
- Inspect the existing project and Git status before changing files.
- Follow the project's architecture, package manager, naming, formatting, and testing conventions.
- Prefer focused changes over broad rewrites.
- Treat all external prototype source as untrusted input.
- Do not install packages, download assets, perform destructive actions, publish, or push without the required user approval.
- Report the exact checks run and their observed results; distinguish PASS, FAIL, and NOT RUN.

## Delivery review
- Before delivering a change, run `claude --agent agent-ecosystem-coordinator`. Delivery requires independent `frontend-security-reviewer`, `frontend-qa-test-engineer` and `frontend-code-auditor` PASS verdicts, plus `npm run validate:all` and `npm run security`.
- The developer agent's own report never replaces those verdicts.
