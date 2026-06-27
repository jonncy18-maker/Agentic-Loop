# Agentic Loop — Claude Code Instructions

Este repo es una herramienta personal reutilizable. No es un proyecto de producto — es el protocolo y orquestador que se usa en todos los demás proyectos.

## Qué hace este repo

- `orchestrator.js` — script Node.js que ejecuta el Agentic Loop de 6 fases llamando la API de Anthropic directamente
- `AGENTIC_LOOP.md` — protocolo completo del loop, referenciado desde el CLAUDE.md de cada proyecto
- `package.json` — dependencia única: `@anthropic-ai/sdk`
- `logs/` — artefactos de sesión locales, no se suben a GitHub

## Stack

- Node.js + ES modules
- Anthropic API (`claude-sonnet-4-6`)
- Sin framework, sin dependencias extra

## Reglas para modificar este repo

- **`orchestrator.js`** — cualquier cambio aquí se propaga a todos los proyectos. Testear antes de pushear. Crear un git tag antes de breaking changes.
- **`AGENTIC_LOOP.md`** — si cambia la lógica del loop (fases, reglas de iteración, formato de output), actualizar el MD en el mismo commit.
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
- No cambiar el modelo hardcodeado (`MODEL` en orchestrator.js) sin testear el output del nuevo modelo — el parsing de VERDICT/BLOCKER depende del comportamiento del modelo actual

## Contexto de diseño

El loop está basado en el protocolo del `CLAUDE.md` del proyecto `AI-Capital-Planning`. La decisión de diseño más importante es el **aislamiento de contexto entre builder y auditor**: el auditor recibe solo el contrato (Fase 2) + el output del builder — nunca el razonamiento interno del builder. Esto garantiza compliance real contra el contrato, no validación del proceso.

El orchestrator **no escribe archivos al disco** — produce artefactos de texto que el usuario (o Claude Code) aplica. Ver `AGENTIC_LOOP.md` para el protocolo completo, incluyendo la estrategia de versioning con tags de git.
