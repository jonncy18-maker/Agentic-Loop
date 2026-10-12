# Branching: one repo per project, two agent lanes

Draft for Agentic-Loop. Each project's `AGENTS.md` links here instead of repeating it.

## Layout

- One repo per project. `main` is the only long-lived branch.
- Claude Code works on `claude/<topic>`. Codex works on `codex/<topic>`.
- `<topic>` is a short kebab-case description (`claude/wealth-baselines`), not a random name.
- Every agent branch is **temporary**: cut from the current `main`, merged back, then deleted.
- Claude Code is the **integrator**. Only the integrator merges into `main`.

## Folder layout (native Linux)

- `~/code/<project>/` is the single clone per project, kept on `main`.
- `~/code/_worktrees/<project>/<agent>-<topic>/` is a `git worktree` for each active agent branch: `git worktree add ../_worktrees/<project>/<agent>-<topic> -b <agent>/<topic> main`.
- Remove a worktree when its branch is integrated: `git worktree remove ../_worktrees/<project>/<agent>-<topic>`.
- Shared rules live in the Agentic-Loop repo, not copied into each project.

## Starting work (any agent)

1. Sync first: `git fetch origin` and fast-forward `main` (`git merge --ff-only origin/main`).
2. Cut your branch from that `main`: `git switch -c <agent>/<topic>`.
3. Keep it small and short-lived. If `main` moves while you work, rebase or merge `main` into your branch before handing back.
4. When done, push the branch and leave a handoff note (see the inbox format: Intent, Ships, Scaffolding, Env assumptions, Not verified).

## Integrating (Claude Code)

For each finished agent branch:

1. Fetch, then update `main`: `git fetch origin && git switch main && git merge --ff-only origin/main`.
2. Merge `main` into the agent branch, not the other way round, so conflicts are resolved on the branch:
   `git switch <agent>/<topic> && git merge main`.
3. Resolve conflicts. Keep the intent of both sides. If resolving would change behavior in a way the branch's handoff note does not explain, ask John.
4. Drop anything the handoff note lists under "Scaffolding (do not merge)".
5. Run `npm test` and `npm run build`.
6. Merge into `main` (squash, to match the existing history): `git switch main && git merge --squash <agent>/<topic>`, then commit.
7. **Delete the temporary branch once it is integrated.** Remove its worktree, then delete the local branch: `git worktree remove <path>` and `git branch -D <agent>/<topic>`. Delete the branch's handoff note as well.
   For the GitHub copy: if it was merged through a PR, GitHub deletes it automatically. Otherwise delete it in the same push John approves for the merge (`git push origin --delete <agent>/<topic>`), or tell John it is still there.
8. Confirm with `git branch -a` that no integrated branch is left behind.

If a branch is declined instead of merged, delete it the same way and say so in one line.

## Housekeeping

- GitHub setting **Automatically delete head branches** is on for every repo, so branches merged through a PR clean themselves up.
- Session start: `git fetch --prune`, then check for stale `claude/*` and `codex/*` branches. Any branch with no open PR and no commits in the last 14 days gets reported to John, then deleted if he agrees.
- Do not leave auto-named branches (`claude/<adjective-name-xxxxxx>`). If a tool created one, rename it to a topic name or delete it when finished.
