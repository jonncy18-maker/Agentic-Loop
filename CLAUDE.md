# Agentic Loop — Claude Code Instructions

Este repo es una herramienta personal reutilizable. No es un proyecto de producto — es el protocolo y orquestador que se usa en todos los demás proyectos.

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
- Anthropic API — modelo por rol: Goal y Audit en `claude-opus-5`, Build en `claude-sonnet-5` (override con `AGENTIC_LOOP_{GOAL,BUILD,AUDIT}_MODEL`)
- Sin framework, sin dependencias extra

## Reglas para modificar este repo

- **`orchestrator.js`** — cualquier cambio aquí se propaga a todos los proyectos. Testear antes de pushear. Crear un git tag antes de breaking changes.
- **`AGENTIC_LOOP.md`** — si cambia la lógica del loop (fases, reglas de iteración, formato de output), actualizar el MD en el mismo commit.
- **`CODER_PROFILE.md`** — cambia poco y deliberadamente. Una regla se gana el lugar por haber sido violada en trabajo real, no por sonar correcta. No duplicar acá nada que ya viva en el contrato de Fase 2.
- **`package.json`** — no agregar dependencias sin razón fuerte. El objetivo es que el orchestrator sea liviano. Commitear `package-lock.json` para installs determinísticos.
- **`logs/`** — nunca commitear. Está en `.gitignore`.

## Selección de modelo para subagentes

**Nombrar la familia, nunca la versión; elegir según qué tan verificable sea el resultado.** La sesión principal elige el modelo para cada tarea. Esto es un default, no una lista cerrada — al reportar, dice qué modelo usó y por qué.
- **Haiku** — cualquier tarea con una especificación clara cuyo resultado se verifica: barridos de archivos o usos, resumir output, edits mecánicos, formateo, tests chicos, docs escritas contra una especificación, búsquedas en paralelo. Es el tier más chico, así que "simple" no alcanza: un trabajo trivial donde nada va a atrapar un error (un edit sensible a seguridad, mover texto literal entre muchos archivos) va a Sonnet.
- **Sonnet** — el default ante la duda: construir features, rastrear bugs, refactors, trabajo de UI, reviews.
- **Opus** — cuando un error sutil saldría caro o el problema es ambiguo, sin importar el tamaño: decisiones de arquitectura y alcance, auditorías donde lo que se escapa cuesta caro.
- **Escalar, no parchar.** Si el resultado de un modelo más barato se ve flojo o falla un check, volver a correrlo un tier arriba en vez de confiar en él o arreglarlo a mano.

Acá se escriben familias ("Sonnet", nunca "Sonnet 5.5"), para que la regla siga apuntando al tier vigente sin editarla. Esto define qué modelo usan los subagentes de Claude Code — no toca los IDs de modelo fijados en el código de aplicación (incluido el orchestrator), que siguen fijados a un ID exacto a propósito.

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
