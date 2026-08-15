# Agentic Loop

Protocolo personal de desarrollo con agentes AI. Define cómo Claude Code planifica, construye, audita e itera sobre cualquier goal — con contextos aislados entre el builder y el auditor.

---

## Qué produce el loop (leer antes de conectar)

El orchestrator produce **artefactos de texto estructurado**: código propuesto, veredictos de audit, entradas de documentación. **No escribe archivos ni ejecuta código** por sí mismo.

El flujo de trabajo es:
1. El loop genera el código propuesto (Builder output)
2. Vos (o Claude Code) aplicás los cambios a los archivos reales
3. El loop audita la propuesta, no el estado real del repo

Si querés que los cambios se apliquen automáticamente, corré el orchestrator dentro de una sesión de Claude Code donde el modelo tiene acceso al filesystem.

---

## Conectar a un proyecto nuevo

Agregar estas líneas al `CLAUDE.md` de cada proyecto:

```markdown
## Agentic Loop
Perfil: https://raw.githubusercontent.com/jonncy18-maker/agentic-loop/main/CODER_PROFILE.md
Protocolo: https://raw.githubusercontent.com/jonncy18-maker/agentic-loop/main/AGENTIC_LOOP.md
Orquestador: https://raw.githubusercontent.com/jonncy18-maker/agentic-loop/main/orchestrator.js
Al inicio de cada sesión, leer el perfil y el protocolo completos desde las URLs de arriba.
```

### Perfil vs. loop

Son dos capas distintas y complementarias:

| | Aplica a | Gobierna |
|---|---|---|
| `CODER_PROFILE.md` | Toda tarea, sin umbral | Cómo se escribe el código y cómo se verifica |
| `AGENTIC_LOOP.md` | Tareas sobre el umbral de activación | Si se construyó lo correcto, con audit aislado |

El contrato de Fase 2 nunca necesita repetir nada del perfil — el perfil ya está cargado.

### Estrategia de versioning

Las URLs apuntan a `main` — cada proyecto sigue la versión más reciente automáticamente.
Esto es conveniente pero tiene un riesgo: un breaking change en `orchestrator.js` afecta todos los
proyectos en la próxima sesión. Si necesitás estabilidad, reemplazá `/main/` por un tag específico:

```
https://raw.githubusercontent.com/jonncy18-maker/agentic-loop/v1.0/AGENTIC_LOOP.md
```

Crear un tag antes de cambios que rompen compatibilidad:

```bash
git tag v1.0 && git push origin v1.0
```

---

## Cuándo activar el loop

Activar cuando **cualquiera** de estas condiciones se cumple:

- El cambio toca 3 o más archivos
- Se crea un componente o módulo nuevo
- Toca la capa de datos (queries, schema, contexto AI)
- Tiene comportamiento visible para el usuario
- Esfuerzo estimado mayor a ~5 minutos

Para todo lo demás — typo, one-liner, config de un archivo — ejecutar directo sin loop.

---

## Las 6 fases

### Fase 1 — Entender & Verificar `[Goal Agent]`

- Si el proyecto tiene `ARCHITECTURE.md` y/o `ROADMAP.md`, el orchestrator los inyecta en el contexto del Goal Agent automáticamente.
- Producir un visual o descripción de qué cambia desde la perspectiva del usuario — qué verá y experimentará después del trabajo (outcome-focused, no implementation-focused)
- Sin listas de archivos, sin diffs
- **Siempre pausar para aprobación explícita antes de continuar**
- Excepción: si el usuario dice "just do it" en el mismo mensaje, o usa el flag `--yes`, saltar automáticamente a Fase 2

### Fase 2 — Instrucciones `[Goal Agent]`

Producir un instruction set que funciona como contrato entre builder y auditor:

1. Goal statement verbatim
2. Spirit del goal en lenguaje simple (qué es el éxito)
3. Archivos específicos a crear o modificar
4. Comportamiento exacto esperado por archivo
5. Criterios de éxito numerados que el audit agent verificará
6. Restricciones explícitas — qué NO hacer

**El usuario aprueba este contrato antes de que el builder lo reciba.** Es el artefacto más importante del loop.

### Fase 3 — Build `[Build Agent — contexto aislado]`

El Build Agent recibe **solo** el instruction set de Fase 2 (+ el outcome aprobado de Fase 1 para orientación). No tiene acceso al razonamiento del Goal Agent ni a iteraciones anteriores salvo los failures específicos del último audit.

Reglas del Build Agent:
- Trabajar únicamente desde las instrucciones
- No tomar decisiones arquitectónicas no cubiertas — reportarlas como `BLOCKER:` (en su propia línea)
- Comentarios de código solo donde el *por qué* no es obvio
- Emitir el contenido COMPLETO de cada archivo modificado (no diffs parciales)

### Fase 4 — Audit `[Audit Agent — contexto aislado]`

El Audit Agent recibe **solo** el instruction set (el contrato) + el output del builder. No recibe el razonamiento interno del builder ni el historial de la sesión.

Distingue dos tipos de falla:

**Falla factual** — el código no coincide con las instrucciones → iterar
**Falla de juicio** — es una decisión de intent que solo el usuario puede resolver → escalar inmediatamente, no consumir una iteración

Output del Audit Agent (primera línea, siempre en inglés, nunca en markdown):
```
VERDICT: PASS | FAIL | ESCALATE
```

- `PASS` — listar items "VISUALLY UNVERIFIED" que el usuario debe confirmar en el browser
- `FAIL` — listar cada falla factual: [ref sección #] → [esperado] → [entregado]
- `ESCALATE` — describir el judgment call y detenerse

### Fase 5 — Iteración

- Máximo **3 iteraciones** (Fase 3 → Fase 4, repetido)
- Cada iteración el Build Agent recibe solo las instrucciones originales + los failures específicos del último audit
- Si el builder produce output idéntico al de la iteración anterior → Stuck Report inmediato (no hay convergencia)
- Si después de 3 iteraciones el audit no pasa → Stuck Report y detenerse

**Formato del Stuck Report:**
```
## Stuck Report

**Goal:** [goal original]
**Reason:** [max-iterations | identical-output | unrecognized-verdict]

**Iteración 1:** [qué se construyó] → [en qué falló el audit]
**Iteración 2:** [qué se cambió] → [en qué falló el audit]
**Iteración 3:** [qué se cambió] → [en qué sigue fallando]

**Root cause:** [qué está bloqueando la convergencia]
**Decisión necesaria:** [pregunta específica para el usuario]
```

### Fase 6 — Documentación `[Goal Agent]`

Después de un audit satisfactorio:

- **`ROADMAP.md`** — agregar entrada de sesión: qué se construyó, cuántas iteraciones, qué encontró el audit
- **`ARCHITECTURE.md`** — actualizar solo si hubo un cambio estructural o de modelo de datos
- El output de Fase 6 se imprime en consola para copy-paste — el usuario lo aplica a los archivos reales

---

## Aislamiento de contexto

El principio central del loop es que el auditor es independiente del proceso de construcción:

| Agente | Recibe | No recibe |
|--------|--------|-----------|
| Build Agent | Instruction set de Fase 2 + outcome aprobado de Fase 1 | Razonamiento del Goal Agent, iteraciones anteriores |
| Audit Agent | Instruction set + output del builder | Razonamiento del builder, historial de la sesión |

Esto garantiza que el audit sea compliance real contra el contrato — no una validación del proceso de construcción.

---

## Ejecutar el orquestador

```bash
# Instalar dependencias (primera vez)
npm install

# Correr el loop
node orchestrator.js "descripción del goal"

# Auto-aprobar gates Fase 1 y 2 (CI / scripted / cuando ya sabés exactamente qué querés)
node orchestrator.js --yes "descripción del goal"

# Shortcut equivalente: incluir "just do it" en el goal
node orchestrator.js "just do it — descripción del goal"

# Con proyecto específico (logs separados en logs/<nombre>/)
node orchestrator.js --project nombre-proyecto "descripción del goal"

# Combinado
node orchestrator.js --project mi-app --yes "descripción del goal"
```

Los logs se guardan en `./logs/` localmente y no se suben a GitHub.

---

## Tokens de control (siempre en inglés)

El orchestrator parsea estos strings de forma programática — deben aparecer exactamente así,
en inglés, en su propia línea, sin markdown alrededor:

| Token | Quién lo emite | Efecto |
|-------|---------------|--------|
| `VERDICT: PASS` | Audit Agent | Loop termina exitosamente → Fase 6 |
| `VERDICT: FAIL` | Audit Agent | Loop itera (o Stuck Report si es la última iteración) |
| `VERDICT: ESCALATE` | Audit Agent | Loop se detiene, requiere decisión del usuario |
| `BLOCKER: [desc]` | Build Agent | Loop se detiene, requiere decisión del usuario |

Si el Goal Agent responde en español, estos tokens igual deben estar en inglés.

---

## Mejoras al loop

Para mejorar el orchestrator o este protocolo, abrir el repo `agentic-loop` en Claude Code. El `CLAUDE.md` del repo explica cómo trabajar sobre el loop mismo.

Cualquier mejora se propaga automáticamente a todos los proyectos en la próxima sesión (a menos que estén pineados a un tag). Crear un tag antes de pushear breaking changes.
