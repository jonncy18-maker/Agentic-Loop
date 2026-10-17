# Agentic Loop

Este repo es una herramienta personal reutilizable. No es un proyecto de producto — es el protocolo y orquestador que se usa en todos los demás proyectos.

Instrucciones compartidas del proyecto para todos los agentes de código (Claude Code, Codex). El rol y los permisos de cada agente viven en su propio archivo global, no aquí.

## Qué hace este repo

- `orchestrator.js` — script Node.js que ejecuta el Agentic Loop de 6 fases llamando la API de Anthropic directamente
- `verdict.js` — parsing de los tokens `VERDICT:` / `BLOCKER:` (separado para poder testearlo sin arrancar el loop)
- `test/` — tests del parser, corren con `npm test`, sin API key
- `scripts/check-verdict-format.mjs` — check en vivo: le manda un audit real a cada modelo configurado y verifica que el verdict sea parseable
- `AGENTIC_LOOP.md` — protocolo completo del loop, referenciado desde el CLAUDE.md de cada proyecto
- `CODER_PROFILE.md` — perfil de coding: estándar de verificación y convenciones que aplican a toda tarea, sin umbral. Se carga siempre; el loop se activa solo sobre el umbral
- `package.json` — dependencia única: `@anthropic-ai/sdk`
- `logs/` — artefactos de sesión locales, no se suben a GitHub

## Stack

- Node.js + ES modules
- Anthropic API — modelo por rol: Goal y Audit en `claude-opus-5-5`, Build en `claude-sonnet-5-5` (override con `AGENTIC_LOOP_{GOAL,BUILD,AUDIT}_MODEL`)
- Sin framework, sin dependencias extra

## Reglas para modificar este repo

- **`orchestrator.js`** — cualquier cambio aquí se propaga a todos los proyectos. Testear antes de pushear. Crear un git tag antes de breaking changes.
- **`AGENTIC_LOOP.md`** — si cambia la lógica del loop (fases, reglas de iteración, formato de output), actualizar el MD en el mismo commit.
- **`CODER_PROFILE.md`** — cambia poco y deliberadamente. Una regla se gana el lugar por haber sido violada en trabajo real, no por sonar correcta. No duplicar acá nada que ya viva en el contrato de Fase 2.
- **`package.json`** — no agregar dependencias sin razón fuerte. El objetivo es que el orchestrator sea liviano. Commitear `package-lock.json` para installs determinísticos.
- **`logs/`** — nunca commitear. Está en `.gitignore`.

## Cómo correr el loop sobre sí mismo

Si querés usar el loop para mejorar el loop:

```bash
node orchestrator.js "descripción de la mejora al orchestrator"
```

El Goal Agent va a pedir aprobación en Fase 1 y Fase 2 antes de tocar nada.

## Lo que NO hacer

- No convertir esto en un framework general — debe seguir siendo simple y opinionado
- No agregar UI, servidor, ni dependencias pesadas
- No subir logs a GitHub
- No cambiar el modelo de un rol (`DEFAULT_MODELS` en orchestrator.js) sin correr `npm test` y `npm run check-verdict` contra el modelo nuevo — el parsing de VERDICT/BLOCKER depende del comportamiento del modelo

## Contexto de diseño

El loop está basado en el protocolo del `CLAUDE.md` del proyecto `AI-Capital-Planning`. La decisión de diseño más importante es el **aislamiento de contexto entre builder y auditor**: el auditor recibe solo el contrato (Fase 2) + el output del builder — nunca el razonamiento interno del builder. Esto garantiza compliance real contra el contrato, no validación del proceso.

El orchestrator **no escribe archivos al disco** — produce artefactos de texto que el usuario (o Claude Code) aplica. Ver `AGENTIC_LOOP.md` para el protocolo completo, incluyendo la estrategia de versioning con tags de git.

## Working in a worktree (Codex)

Applies when your working directory is under `~/code/_worktrees/<repo>/`. Each worktree is one temporary branch (`codex/<topic>`) cut from the local `main` in `~/code/<repo>`.

1. Before you start, confirm the branch was cut from the current local `main`. If it is behind, run `git merge main` on your branch and tell John.
2. Do your work on that branch; never edit `main`.
3. When you finish, leave a handoff note in the inbox (`~/code/_inbox/`); Claude Code integrates the branch and deletes it.

## Branching

One repo per project; `main` plus short-lived `<agent>/<topic>` branches (`claude/`, `codex/`). Claude Code integrates into `main` and deletes each branch once it is integrated. Full rules, folder layout and the integration steps: https://raw.githubusercontent.com/jonncy18-maker/Agentic-Loop/main/BRANCHING.md

**Before any work:** run `git fetch origin`, confirm local `main` matches `origin/main` (fast-forward only), and branch from it. If `main` is behind or has diverged, stop and tell John instead of working on a stale copy.

## Reporting to John

When you give John information (a plan, review, status, comparison, folder or branch layout, audit result), include a visual with it. Pick the simplest one that fits:

- Structure, layout, flow or branches: a diagram (Mermaid block, or a small table-tree if Mermaid will not render).
- Status or comparison: a table.
- Anything John will keep: also write it as an HTML or Markdown file in the shared inbox (`~/code/_inbox/`) and name the path.

Lead with the visual, then add a short text explanation. A one- or two-sentence answer does not need a visual.

## Audit and refactor reports

All audit and refactor conclusions for this repo go in `~/code/_inbox/Agentic-Loop/`. Write only there; never write reports into this repo.

- `STATE.md`: read first. It holds `last_audited_sha`, the protected paths and the test command. Update its front matter after each successful audit.
- `LEDGER.md`: every finding ever reported. Check a finding's fingerprint here before reporting it; skip anything `declined` or `fixed` unless the code at that fingerprint changed. Append new findings as `open` rows. Codex may set `in-progress` when it starts a branch; only Claude sets every other status.
- `audits/<YYYY-MM-DD-HHMM>__<auditor>.md`: one file per audit, using `~/code/_inbox/_templates/audit.md`. Audits are read-only and incremental from `last_audited_sha`; skip the audit if HEAD has not moved.
- `handoffs/<branch-slug>__<auditor>.md`: one note per refactor branch when you finish, using `~/code/_inbox/_templates/handoff.md`. List the ledger IDs it resolves.

Refactors happen in a worktree on a `codex/<topic>` branch. Do not touch the protected paths in `STATE.md`. Claude Code reviews and integrates; critical findings also get flagged to John immediately.
