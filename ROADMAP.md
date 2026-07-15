# Agentic Loop — Roadmap

## Next Up

Cut the first stable release tag (`v1.0`) so downstream projects can pin to it instead of tracking `main`. The orchestrator is already at `package.json` version 1.0.0 and has been through a full audit-hardening pass, but no git tag exists yet — every consuming project currently fetches `orchestrator.js` / `AGENTIC_LOOP.md` from `main` and inherits any breaking change on its next session. Tagging `v1.0` before the next breaking change is exactly what `AGENTIC_LOOP.md` and `CLAUDE.md` already prescribe.

## Notes

This repo is a personal, reusable AI-development protocol (not a product): `orchestrator.js` runs a 6-phase build/audit loop against the Anthropic API with isolated builder/auditor contexts, and `AGENTIC_LOOP.md` is the protocol doc other projects reference by raw URL. This ROADMAP exists primarily to expose a standardized `## Next Up` line to the Personal Dashboard's AI Projects view; day-to-day state lives in `AGENTIC_LOOP.md` and `CLAUDE.md`.
