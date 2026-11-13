# Conventions

Project rules live in `.claude/rules/*.md` (code-style, git-workflow, testing, security) — follow them; key points:
- TS: `const`, early returns, explicit return types on exports, `unknown` over `any`, no empty catch, log errors with context, `@/` imports.
- Git: never commit to `main`; branch `feat/<desc>`; Conventional Commits; stage explicit paths (not `git add -A`); small PRs.
- Tests: `it('should … when …')`, negative paths required for contracts (ACL, double entry, forged proof).
- Security: no secrets in `VITE_*`, validate boundaries with zod where applicable.
- Solidity: NatSpec on public API; state in a comment what stays public vs private; max line 120 (solhint).
- Project-specific: reply/commit text in English; user (JA) communicates in Japanese.
