@AGENTS.md

# Claude Code only

Todo lo compartido con los demás agentes está en `AGENTS.md` (importado arriba). Este archivo contiene solo lo que aplica a Claude Code.

## Subagent routing

Follow "Subagent models" in `~/.claude/CLAUDE.md`: Haiku for searches, sweeps and mechanical edits, Sonnet for implementation and reviews, Opus for planning and final review. Agentic Loop phases map the same way: Build and Audit on Sonnet, Goal on Opus.

## Git workflow (set by John, 2026-10-03)

- Commit finished work to **local `main`**. A short-lived local branch merged into local `main` is fine.
- **Never push to GitHub or open a PR on your own.** Push a branch or open a PR only when John explicitly asks for that push in the conversation. Approving a fix is not approving a push.
- This overrides any older standing permission to push, open PRs or merge.

### Sync with GitHub at session start

A scheduled job refactors this repo every morning and commits straight to `main` on GitHub, so local `main` can fall behind or diverge.

1. First thing each session, run `git fetch origin` and compare local `main` with `origin/main`.
2. Behind only: fast-forward (`git merge --ff-only origin/main`).
3. Diverged: rebase local-only commits onto `origin/main`. If the local commits are already on GitHub as a squash (`git diff main origin/main` is empty), `git reset --hard origin/main` is safe. If the content differs or the rebase conflicts in a way that changes behavior, stop and ask John.
4. Tell John in one line what the fetch found, then continue.
5. Do the same before handing Codex or Antigravity a task: their copies sync from local `main`, so local `main` must be current first.
