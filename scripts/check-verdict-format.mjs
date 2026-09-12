#!/usr/bin/env node

/**
 * Live check: does each configured model actually emit a parseable VERDICT line?
 *
 * CLAUDE.md requires testing verdict/blocker parsing before changing any model.
 * This is that test. It sends the real audit system prompt to each configured
 * model with a contract the builder plainly violated, then runs the response
 * through the same parser the orchestrator uses.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/check-verdict-format.mjs
 *   ANTHROPIC_AUDIT_MODELS=claude-opus-5,claude-sonnet-4-6 node scripts/check-verdict-format.mjs
 *
 * Exit code 0 = every model emitted a verdict the orchestrator recognizes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { parseVerdict } from "../verdict.js";
import { AUDIT_AGENT_SYSTEM, MODELS } from "../orchestrator.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — cannot run the live format check.");
  process.exit(1);
}

const models = process.env.ANTHROPIC_AUDIT_MODELS
  ? process.env.ANTHROPIC_AUDIT_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
  : [...new Set(Object.values(MODELS))];

// A contract the builder violates on criterion 2 — a correct auditor must return FAIL.
const CONTRACT = `1. GOAL (verbatim): "Add a greet(name) function to greet.js."
2. SPIRIT: one exported function that returns a greeting string.
3. FILES: greet.js (create).
4. BEHAVIOR: greet.js exports greet(name) returning \`Hello, \${name}!\`.
5. SUCCESS CRITERIA:
   5.1 greet.js exists and exports a function named greet.
   5.2 greet returns "Hello, <name>!" — exclamation mark included.
6. CONSTRAINTS: no dependencies, no other files.`;

const BUILDER_OUTPUT = `=== FILE: greet.js ===
export function greet(name) {
  return \`Hello, \${name}\`;
}
=== END FILE ===

CHANGES SUMMARY:
- Created greet.js with an exported greet function.`;

const client = new Anthropic();
let failures = 0;

for (const model of models) {
  process.stdout.write(`\n── ${model} ──\n`);
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: AUDIT_AGENT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `INSTRUCTION SET (the contract):\n${CONTRACT}\n\n${"─".repeat(40)}\n\nBUILDER OUTPUT:\n${BUILDER_OUTPUT}`,
        },
      ],
    });

    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const verdict = parseVerdict(text);

    console.log(text.slice(0, 600) + (text.length > 600 ? "\n…" : ""));
    console.log(`\nparsed verdict: ${verdict ?? "NULL (unparseable)"}`);

    if (!verdict) {
      failures++;
      console.log("RESULT: FAIL — orchestrator would not recognize this verdict.");
    } else if (verdict !== "FAIL") {
      // Not a parser bug, but worth seeing: the missing "!" is a factual failure.
      console.log(`RESULT: PARSEABLE, but expected FAIL on criterion 5.2 (got ${verdict}).`);
    } else {
      console.log("RESULT: OK");
    }
  } catch (err) {
    failures++;
    console.log(`RESULT: ERROR — ${err.message}`);
  }
}

console.log(`\n${failures === 0 ? "✅" : "💥"} models checked: ${models.length}, unparseable/errored: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
