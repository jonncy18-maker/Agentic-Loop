#!/usr/bin/env node

/**
 * Agentic Loop Orchestrator
 * Based on CLAUDE.md protocol from AI-Capital-Planning
 *
 * Phases:
 *   1 — Understand & Verify   (Goal Agent)
 *   2 — Instructions          (Goal Agent)
 *   3 — Build                 (Build Agent  — isolated context)
 *   4 — Audit                 (Audit Agent  — isolated context: instructions + builder output)
 *   5 — Iteration             (up to MAX_ITERATIONS × Build → Audit)
 *   6 — Documentation         (Goal Agent)
 *
 * What this produces: structured text artifacts (proposed code, audit verdicts, docs).
 * Applying the builder's output to real files is the user's responsibility (or Claude Code's).
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";

// ─── Config ────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 32000;
const MAX_ITERATIONS = 3;
const LOG_DIR = "./logs";
const MAX_RETRY_ATTEMPTS = 3;

// ─── Argument parsing ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { project: null, yes: false, goal: "" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--project" || argv[i] === "-p") && argv[i + 1]) {
      args.project = argv[++i];
    } else if (argv[i] === "--yes" || argv[i] === "-y") {
      args.yes = true;
    } else {
      rest.push(argv[i]);
    }
  }
  args.goal = rest.join(" ");
  // "just do it" in the goal body skips Phase-1 approval (documented protocol shortcut)
  if (/just do it/i.test(args.goal)) args.yes = true;
  return args;
}

// ─── Startup validation ─────────────────────────────────────────────────────

function validateEnv() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\n💥 ANTHROPIC_API_KEY is not set.\n" +
      "   Export it before running:\n" +
      "   export ANTHROPIC_API_KEY=sk-ant-...\n"
    );
    process.exit(1);
  }
}

// ─── Logging ───────────────────────────────────────────────────────────────

function initSession(goal, projectName) {
  const logDir = projectName ? path.join(LOG_DIR, projectName) : LOG_DIR;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  // Millisecond precision avoids filename collisions on rapid back-to-back runs
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  const slug = goal.slice(0, 40).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const sessionFile = path.join(logDir, `${ts}_${slug}.json`);
  const session = {
    goal,
    project: projectName || null,
    startedAt: new Date().toISOString(),
    phases: [],
    iterations: 0,
    outcome: null,
  };
  safeWriteSession(sessionFile, session);
  return { sessionFile, session };
}

function safeWriteSession(sessionFile, session) {
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  } catch (err) {
    console.error(`\n⚠️  Could not write session log: ${err.message}`);
  }
}

function logPhase(sessionFile, session, phase, agentRole, input, output) {
  session.phases.push({
    phase,
    agentRole,
    timestamp: new Date().toISOString(),
    inputSummary: input.slice(0, 200) + (input.length > 200 ? "…" : ""),
    output,
  });
  safeWriteSession(sessionFile, session);
}

function finalizeSession(sessionFile, session, outcome) {
  session.outcome = outcome;
  session.completedAt = new Date().toISOString();
  safeWriteSession(sessionFile, session);
  console.log(`\n📁 Session log saved → ${sessionFile}`);
}

// ─── Console output helpers ─────────────────────────────────────────────────

const PHASE_LABELS = {
  1: "🔍 Fase 1 — Entender & Verificar",
  2: "📋 Fase 2 — Instrucciones",
  3: "🔨 Fase 3 — Build",
  4: "🔎 Fase 4 — Audit",
  5: "🔁 Fase 5 — Iteración",
  6: "📝 Fase 6 — Documentación",
};

function printPhaseHeader(phase, extra = "") {
  const label = PHASE_LABELS[phase] || `Fase ${phase}`;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${label}${extra ? "  " + extra : ""}`);
  console.log("─".repeat(60));
}

function printAgentOutput(role, text) {
  const tag = { goal: "🎯 GOAL", build: "🔨 BUILD", audit: "🔎 AUDIT" }[role] || role.toUpperCase();
  console.log(`\n[${tag}]\n`);
  console.log(text);
}

// ─── Anthropic client ───────────────────────────────────────────────────────

const client = new Anthropic();

async function callAgent(systemPrompt, userMessage) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      if (response.stop_reason === "max_tokens") {
        throw new Error(
          `Model output was TRUNCATED (stop_reason: max_tokens) after ${MAX_TOKENS} tokens.\n` +
          "The agent's output is incomplete and must not be passed to the next phase.\n" +
          "Fix: split the task into smaller pieces, or raise MAX_TOKENS in the config."
        );
      }

      return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } catch (err) {
      lastErr = err;
      // Truncation is a config problem, not a transient error — don't retry
      if (err.message && err.message.includes("TRUNCATED")) throw err;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = Math.pow(2, attempt) * 1000; // 2 s, 4 s
        console.error(`\n⚠️  API error (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}): ${err.message}`);
        console.error(`   Retrying in ${delay / 1000}s…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Project context ────────────────────────────────────────────────────────

function readProjectContext() {
  const docs = [];
  for (const filename of ["ARCHITECTURE.md", "ROADMAP.md"]) {
    try {
      const content = fs.readFileSync(filename, "utf8");
      docs.push(`--- ${filename} ---\n${content}`);
    } catch {
      // Not present in this project — skip
    }
  }
  return docs.length > 0
    ? `\n\n--- PROJECT CONTEXT (read-only, for grounding) ---\n${docs.join("\n\n")}`
    : "";
}

// ─── Agent system prompts ───────────────────────────────────────────────────
//
// IMPORTANT: VERDICT, PASS, FAIL, ESCALATE, BLOCKER are machine-parsed tokens.
// They MUST appear in English exactly as shown, on their own line, regardless of
// the language the goal is written in. All other prose may follow the goal language.

const GOAL_AGENT_SYSTEM = `You are the Goal Agent in an Agentic Loop orchestration system.

Your responsibilities depend on the current phase:

PHASE 1 — Understand & Verify:
- If project context files (ARCHITECTURE.md, ROADMAP.md) are provided, use them to ground your analysis.
- Produce a clear visual/textual description of what the user will SEE and EXPERIENCE after the work is done (outcome-focused, not implementation-focused).
- No file lists, no diffs. Focus on user-facing behavior change.

PHASE 2 — Instructions:
- Produce a detailed instruction set that will serve as the contract between builder and auditor.
- Include: (1) original goal statement verbatim, (2) spirit of the goal in plain language, (3) specific files to create or modify, (4) exact behavior expected per file, (5) numbered success criteria the audit agent will check, (6) explicit constraints and things NOT to do.
- Number each section. This is the binding contract — be precise.

PHASE 6 — Documentation:
- Produce ready-to-paste content for project documents.
- Format each section with a clear header:
  === ROADMAP.md ENTRY ===
  [content here]
  === ARCHITECTURE.md UPDATE ===
  [content here — only if a structural change occurred]
- Be concise. One paragraph per document.

Always respond in the same language as the goal provided, EXCEPT for machine-parsed tokens
(VERDICT, PASS, FAIL, ESCALATE, BLOCKER) which MUST always be in English.`;

const BUILD_AGENT_SYSTEM = `You are the Build Agent in an Agentic Loop orchestration system.

CRITICAL RULES:
- You work ONLY from the instruction set provided. Do not re-interpret the goal.
- Make NO architectural decisions not covered in the instructions — surface them as BLOCKERS instead.
- Write code comments only where the WHY is non-obvious. No narration, no "added for X" comments.
- If you encounter an uncovered decision, stop and report it on its own line:
  BLOCKER: [description of the decision needed]

Your output format:
1. For every file you are creating or modifying, output its COMPLETE NEW CONTENT using this wrapper:
   === FILE: path/to/file.ext ===
   [complete file content — never a partial diff]
   === END FILE ===
2. End with a CHANGES SUMMARY: bullet list of exactly what was done.
3. Do not explain your reasoning process — the output speaks for itself.

You have NO knowledge of any previous build attempts or auditor feedback unless it is explicitly
included in your input under "AUDIT FAILURES FROM PREVIOUS ITERATION".`;

const AUDIT_AGENT_SYSTEM = `You are the Audit Agent in an Agentic Loop orchestration system.

You receive two things: (1) the original instruction set (the contract), and (2) the builder's output.
You have NO knowledge of the builder's reasoning, workarounds, or internal process.

Your job is to reconcile what was built against the contract. You distinguish between TWO failure types:

FACTUAL FAILURE — the code does not match the instructions exactly.
- These can be fixed by the build agent in another iteration.
- List each one precisely: [Section #] → [Expected] → [Delivered]

JUDGMENT FAILURE — a spirit/intent question only the user can resolve.
- ESCALATE IMMEDIATELY. Do not consume an iteration on a judgment call.

UI CHANGES — flag as "VISUALLY UNVERIFIED: [specific element to check in browser]"

CRITICAL — YOUR VERDICT TOKEN:
Your verdict MUST appear on its own line, in English, exactly as one of these three:
VERDICT: PASS
VERDICT: FAIL
VERDICT: ESCALATE

Do NOT wrap it in markdown. Do NOT translate it. It is machine-parsed by the orchestrator.
Place it as the FIRST content line of your response so it is unambiguous.

If PASS:
- List any VISUALLY UNVERIFIED items the user must confirm in the browser.

If FAIL:
- List each FACTUAL FAILURE: [Section #] → [Expected] → [Delivered]
- You may also list JUDGMENT FAILURES, but still return VERDICT: FAIL unless the entire run needs escalation.

If ESCALATE:
- Describe the judgment call needed and stop.

Be precise and terse. No praise, no filler.`;

// ─── Human approval gate ─────────────────────────────────────────────────────

async function waitForApproval(prompt, autoApprove) {
  if (autoApprove) {
    console.log(`\n${prompt} [y/n]: y  (auto-approved)`);
    return true;
  }
  if (!process.stdin.isTTY) {
    console.error(
      "\n⚠️  Non-interactive terminal detected. Use --yes to skip approval gates.\n" +
      "   Aborting to avoid hanging indefinitely."
    );
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${prompt} [y/n]: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ─── Verdict parsing ────────────────────────────────────────────────────────

// Anchored to line-start; case-sensitive — tokens must be uppercase English as instructed
const VERDICT_RE = /^[ \t]*VERDICT:\s*(PASS|FAIL|ESCALATE)\s*$/m;

function parseVerdict(text) {
  const m = text.match(VERDICT_RE);
  return m ? m[1] : null;
}

// ─── Convergence detection ───────────────────────────────────────────────────

function hashOutput(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

async function runLoop(goal, opts) {
  const { sessionFile, session } = initSession(goal, opts.project);

  console.log(`\n🚀 Agentic Loop iniciado`);
  console.log(`   Goal: ${goal}`);
  if (opts.project) console.log(`   Proyecto: ${opts.project}`);
  console.log(`   Modelo: ${MODEL}`);
  console.log(`   Log: ${sessionFile}`);

  const projectContext = readProjectContext();
  if (projectContext) {
    console.log("   📎 Project context found (ARCHITECTURE.md / ROADMAP.md injected into Phase 1)");
  }

  // ── FASE 1: Understand & Verify ──────────────────────────────────────────
  printPhaseHeader(1);

  const phase1Output = await callAgent(
    GOAL_AGENT_SYSTEM,
    `PHASE: 1\nGOAL: ${goal}${projectContext}`
  );

  printAgentOutput("goal", phase1Output);
  logPhase(sessionFile, session, 1, "goal", goal, phase1Output);

  const approved1 = await waitForApproval(
    "¿Aprobás este outcome y querés continuar?",
    opts.yes
  );
  if (!approved1) {
    console.log("\n⛔ Loop cancelado en Fase 1 por el usuario.");
    finalizeSession(sessionFile, session, "cancelled_phase_1");
    return;
  }

  // ── FASE 2: Instructions ─────────────────────────────────────────────────
  printPhaseHeader(2);

  const phase2Output = await callAgent(
    GOAL_AGENT_SYSTEM,
    `PHASE: 2\nGOAL: ${goal}\n\nPhase 1 outcome description (approved by user):\n${phase1Output}`
  );

  printAgentOutput("goal", phase2Output);
  logPhase(sessionFile, session, 2, "goal", goal, phase2Output);

  // Gate: the human approves the CONTRACT before it drives the builder
  const approved2 = await waitForApproval(
    "¿Aprobás estas instrucciones (el contrato) y querés que el builder empiece?",
    opts.yes
  );
  if (!approved2) {
    console.log("\n⛔ Loop cancelado en Fase 2 por el usuario.");
    finalizeSession(sessionFile, session, "cancelled_phase_2");
    return;
  }

  const instructionSet = phase2Output;

  // ── FASE 3 → 4 → 5 loop ─────────────────────────────────────────────────
  let iterationCount = 0;
  let auditVerdict = null;
  let builderOutput = null;
  let stuckReport = null;
  let lastBuildHash = null;

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    const isFirstBuild = iterationCount === 1;

    // ── Build ──────────────────────────────────────────────────────────────
    printPhaseHeader(isFirstBuild ? 3 : 5, isFirstBuild ? "" : `build (iteración ${iterationCount}/${MAX_ITERATIONS})`);

    const buildInput = isFirstBuild
      ? `APPROVED OUTCOME (Phase 1, approved by user):\n${phase1Output}\n\nINSTRUCTION SET:\n${instructionSet}`
      : `INSTRUCTION SET:\n${instructionSet}\n\nAUDIT FAILURES FROM PREVIOUS ITERATION (fix only these):\n${auditVerdict}`;

    builderOutput = await callAgent(BUILD_AGENT_SYSTEM, buildInput);

    printAgentOutput("build", builderOutput);
    logPhase(sessionFile, session, isFirstBuild ? 3 : 5, "build", buildInput, builderOutput);

    // Convergence detection — identical output means the loop is stuck
    const currentHash = hashOutput(builderOutput);
    if (!isFirstBuild && currentHash === lastBuildHash) {
      console.log("\n⚠️  Builder produjo output idéntico al de la iteración anterior — sin convergencia.");
      stuckReport = buildStuckReport(goal, session, "identical-output");
      break;
    }
    lastBuildHash = currentHash;

    // BLOCKER must be on its own line to avoid false positives from comments
    if (/^BLOCKER:/im.test(builderOutput)) {
      console.log("\n⚠️  El builder reportó un BLOCKER. Revisar output arriba.");
      finalizeSession(sessionFile, session, "blocked");
      return;
    }

    // ── Audit ──────────────────────────────────────────────────────────────
    printPhaseHeader(isFirstBuild ? 4 : 5, isFirstBuild ? "" : `audit (iteración ${iterationCount}/${MAX_ITERATIONS})`);

    const auditInput =
      `INSTRUCTION SET (the contract):\n${instructionSet}\n\n` +
      `${"─".repeat(40)}\n\n` +
      `BUILDER OUTPUT:\n${builderOutput}`;

    auditVerdict = await callAgent(AUDIT_AGENT_SYSTEM, auditInput);

    printAgentOutput("audit", auditVerdict);
    logPhase(sessionFile, session, isFirstBuild ? 4 : 5, "audit", auditInput, auditVerdict);

    session.iterations = iterationCount;
    safeWriteSession(sessionFile, session);

    // Anchored regex parse — prevents substring collisions in prose
    const verdict = parseVerdict(auditVerdict);

    if (verdict === "PASS") {
      console.log("\n✅ Audit: PASS");
      break;
    } else if (verdict === "ESCALATE") {
      console.log("\n🔺 Audit requiere decisión de usuario — ESCALATE.");
      console.log("   El builder output está guardado en el session log.");
      finalizeSession(sessionFile, session, "escalated");
      return;
    } else if (verdict === "FAIL") {
      console.log(`\n❌ Audit: FAIL (iteración ${iterationCount}/${MAX_ITERATIONS})`);
      if (iterationCount === MAX_ITERATIONS) {
        stuckReport = buildStuckReport(goal, session, "max-iterations");
        break;
      }
    } else {
      // Unrecognized verdict — hard failure, NOT a silent success
      console.error(
        `\n💥 El audit no emitió un VERDICT reconocido (PASS / FAIL / ESCALATE).\n` +
        `   Primeros 300 chars del output:\n   ${auditVerdict.slice(0, 300)}\n`
      );
      if (iterationCount === MAX_ITERATIONS) {
        stuckReport = buildStuckReport(goal, session, "unrecognized-verdict");
        break;
      }
      // Non-final iteration: treat as FAIL and continue
      console.log(`   Tratando como FAIL y continuando (iteración ${iterationCount}/${MAX_ITERATIONS})`);
      auditVerdict = `VERDICT: FAIL\n\nThe auditor did not emit a recognized verdict. Retry the build based on the original instruction set.`;
    }
  }

  // ── Stuck Report ──────────────────────────────────────────────────────────
  if (stuckReport) {
    console.log("\n" + "═".repeat(60));
    console.log(`🚨 STUCK REPORT — ${MAX_ITERATIONS} iteraciones sin audit satisfactorio`);
    console.log("═".repeat(60));
    console.log(stuckReport);
    logPhase(sessionFile, session, 5, "orchestrator", "stuck", stuckReport);
    finalizeSession(sessionFile, session, "stuck");
    return;
  }

  // ── FASE 6: Documentation ─────────────────────────────────────────────────
  printPhaseHeader(6);

  const phase6Input =
    `GOAL: ${goal}\n\n` +
    `INSTRUCTION SET:\n${instructionSet}\n\n` +
    `FINAL BUILDER OUTPUT:\n${builderOutput}\n\n` +
    `FINAL AUDIT VERDICT:\n${auditVerdict}\n\n` +
    `Total iterations: ${iterationCount}`;

  const phase6Output = await callAgent(
    GOAL_AGENT_SYSTEM,
    `PHASE: 6\n${phase6Input}`
  );

  printAgentOutput("goal", phase6Output);
  logPhase(sessionFile, session, 6, "goal", phase6Input, phase6Output);

  // Surface docs clearly for copy-paste
  console.log("\n" + "═".repeat(60));
  console.log("📋 DOCUMENTATION — copy-paste into your project files:");
  console.log("═".repeat(60));
  console.log(phase6Output);
  console.log("═".repeat(60));

  // Surface VISUALLY UNVERIFIED items
  const visualItems = auditVerdict.match(/VISUALLY UNVERIFIED[^\n]*/gi) || [];
  if (visualItems.length > 0) {
    console.log("\n🖥️  Items to verify in the browser:");
    for (const item of visualItems) console.log(`   • ${item}`);
  }

  finalizeSession(sessionFile, session, "completed");
  console.log("\n🎉 Loop completado exitosamente.");
}

// ─── Stuck Report builder ───────────────────────────────────────────────────

function buildStuckReport(goal, session, reason) {
  const buildPhases = session.phases.filter((p) => p.agentRole === "build");
  const auditPhases = session.phases.filter((p) => p.agentRole === "audit");

  let report = `## Stuck Report\n\n**Goal:** ${goal}\n**Reason:** ${reason}\n\n`;
  for (let i = 0; i < buildPhases.length; i++) {
    report += `**Iteración ${i + 1}:** ${buildPhases[i]?.output?.slice(0, 200)}…\n`;
    report += `  → Audit: ${auditPhases[i]?.output?.slice(0, 200)}…\n\n`;
  }
  report += `**Root cause:** ${MAX_ITERATIONS} iteraciones sin convergencia (${reason}).\n`;
  report += `**Decisión necesaria:** Revisar el último audit output arriba y determinar si el problema es de instrucciones o de implementación.`;
  return report;
}

// ─── Entry point ────────────────────────────────────────────────────────────

validateEnv();

const args = parseArgs(process.argv.slice(2));
if (!args.goal) {
  console.error(
    "Usage: node orchestrator.js [--project <name>] [--yes] <goal description>\n\n" +
    "  --project <name>   Separate logs under logs/<name>/\n" +
    "  --yes / -y         Auto-approve Phase-1 and Phase-2 gates (CI / scripted use)\n" +
    "                     Also triggered by including 'just do it' in the goal text\n"
  );
  process.exit(1);
}

runLoop(args.goal, args).catch((err) => {
  console.error("\n💥 Error fatal:", err.message);
  process.exit(1);
});
