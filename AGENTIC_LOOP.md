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

## Cómo se le presentan las fases al humano

**Las dos aprobaciones y el cierre del run se presentan como artifact visual, no como texto en
la terminal.** Lo que el humano tiene que aprobar o juzgar es exactamente lo que peor se lee
como pared de texto: un outcome, un contrato de seis secciones con criterios numerados, un
audit con fallas punto por punto.

Quién lo publica: **Claude Code, no el orchestrator.** `orchestrator.js` llama la API y escribe
texto a stdout — no tiene acceso a artifacts y no debería tenerlo. Cuando el loop corre dentro
de una sesión de Claude Code, el modelo toma el output de la fase y lo publica; cuando corre
solo desde la terminal, el texto en consola sigue siendo la única salida y el loop funciona
igual. La regla es sobre la presentación, no sobre el protocolo.

| Fase | Qué recibe el humano |
|---|---|
| 1 — Outcome | **Artifact** — es lo que se aprueba |
| 2 — Contrato | **Artifact** — criterios numerados, restricciones, archivos |
| 3 — Build | Texto / archivos. Es materia prima para aplicar, no para leer |
| 4–5 — Audit e iteraciones | Nada por iteración. Se acumulan para el cierre |
| Cierre (PASS, ESCALATE o Stuck Report) | **Artifact** — veredicto, iteraciones, qué quedó sin verificar |

**Máximo tres artifacts por run.** Uno por gate y uno de cierre. Un artifact por iteración es
la misma pared de texto con clicks de más.

**El mensaje que acompaña al artifact no es un link solo.** Un artifact es fácil de saltear, así
que lo que cambia una decisión — qué quedó sin verificar, qué está bloqueado, qué se necesita
del usuario — se dice también en el mensaje. Especialmente en los gates: la pregunta que se
está haciendo va en el texto, no solo adentro de la página.

---

## Las 6 fases

### Fase 1 — Entender & Verificar `[Goal Agent]`

- Si el proyecto tiene `ARCHITECTURE.md` y/o `ROADMAP.md`, el orchestrator los inyecta en el contexto del Goal Agent automáticamente.
- Producir un visual o descripción de qué cambia desde la perspectiva del usuario — qué verá y experimentará después del trabajo (outcome-focused, no implementation-focused)
- Sin listas de archivos, sin diffs
- **Presentar como artifact** cuando el loop corre dentro de Claude Code, con la pregunta de aprobación en el mensaje
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

**El usuario aprueba este contrato antes de que el builder lo reciba.** Es el artefacto más importante del loop — y el que más gana con presentarse como artifact: seis secciones numeradas leídas como párrafos son el mismo contenido sin la estructura que lo hace revisable.

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
**Reason:** [max-iterations | identical-output]

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
- El **artifact de cierre** va acá: veredicto final, cuántas iteraciones, qué encontró el audit, qué quedó sin verificar. Un solo artifact para todo el run, no uno por fase

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

## Modelos por rol

Cada rol del loop corre con su propio modelo. Los roles de razonamiento —
escribir el contrato y juzgar el audit — usan el modelo más fuerte; emitir
archivos completos no lo necesita.

| Rol | Fases | Default | Override |
|---|---|---|---|
| Goal Agent | 1, 2, 6 | `claude-opus-5` | `AGENTIC_LOOP_GOAL_MODEL` |
| Build Agent | 3 y builds de Fase 5 | `claude-sonnet-5` | `AGENTIC_LOOP_BUILD_MODEL` |
| Audit Agent | 4 y audits de Fase 5 | `claude-opus-5` | `AGENTIC_LOOP_AUDIT_MODEL` |

```bash
# Correr todo el loop en un solo modelo
AGENTIC_LOOP_GOAL_MODEL=claude-sonnet-4-6 \
AGENTIC_LOOP_AUDIT_MODEL=claude-sonnet-4-6 \
  node orchestrator.js "descripción del goal"
```

El banner de arranque imprime los tres modelos, y cada entrada del session log
guarda el modelo que efectivamente corrió esa fase.

**Antes de cambiar el modelo de un rol**, correr el check de formato de verdict
contra el modelo nuevo — el parsing de `VERDICT:` / `BLOCKER:` depende del
comportamiento del modelo:

```bash
npm test                                    # parser offline (no necesita API key)
ANTHROPIC_API_KEY=sk-ant-... npm run check-verdict   # llamada real a cada modelo configurado
```

---

## Tokens de control (siempre en inglés)

El orchestrator parsea estos strings de forma programática — deben aparecer exactamente así,
en inglés, en su propia línea:

| Token | Quién lo emite | Efecto |
|-------|---------------|--------|
| `VERDICT: PASS` | Audit Agent | Loop termina exitosamente → Fase 6 |
| `VERDICT: FAIL` | Audit Agent | Loop itera (o Stuck Report si es la última iteración) |
| `VERDICT: ESCALATE` | Audit Agent | Loop se detiene, requiere decisión del usuario |
| `BLOCKER: [desc]` | Build Agent | Loop se detiene, requiere decisión del usuario |

Si el Goal Agent responde en español, estos tokens igual deben estar en inglés.

El requisito duro es que **el token ocupe su propia línea**. Dentro de eso el parser
es deliberadamente tolerante: markdown (`**VERDICT: PASS**`, `## VERDICT: FAIL`),
indentación, mayúsculas/minúsculas (`Verdict: pass`) y puntuación final
(`VERDICT: PASS.`) son deriva de formato, no desacuerdo.

Lo que sigue rechazando: el token traducido (`VEREDICTO:`), un valor que no sea
PASS/FAIL/ESCALATE, y el token embebido en medio de una línea de prosa — si el
auditor menciona `VERDICT: PASS` razonando, no debe disparar el parser.

Los casos exactos están en `test/verdict.test.mjs`.

### Si el verdict igual no se puede leer

El orchestrator **nunca adivina un verdict**. Cuando el token no parsea, re-pregunta
una sola vez al Audit Agent por la línea sola (`VERDICT_REASK_SYSTEM`), pasándole su
propio output. Si el re-ask tampoco parsea, el loop termina con outcome
`unparseable_verdict` y se lo pasa al usuario.

Esto importa porque el fallback anterior era sintetizar un `VERDICT: FAIL`: un build
que había pasado se descartaba y se quemaba una iteración, con el run pareciendo un
fallo normal. Un modelo que simplemente pone su verdict en negrita degradaba el loop
de forma invisible.

---

## Mejoras al loop

Para mejorar el orchestrator o este protocolo, abrir el repo `agentic-loop` en Claude Code. El `CLAUDE.md` del repo explica cómo trabajar sobre el loop mismo.

Cualquier mejora se propaga automáticamente a todos los proyectos en la próxima sesión (a menos que estén pineados a un tag). Crear un tag antes de pushear breaking changes.
