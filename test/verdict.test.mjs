import test from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, hasBlocker } from "../verdict.js";

// ── Verdicts the orchestrator must recognize ───────────────────────────────

test("parses the canonical verdict line as the first line", () => {
  assert.equal(parseVerdict("VERDICT: PASS\n\nNo failures."), "PASS");
  assert.equal(parseVerdict("VERDICT: FAIL\n\n[Section 3] → x → y"), "FAIL");
  assert.equal(parseVerdict("VERDICT: ESCALATE\n\nIntent question."), "ESCALATE");
});

test("parses a verdict that is not the first line", () => {
  assert.equal(parseVerdict("Audit of the contract.\n\nVERDICT: FAIL\n"), "FAIL");
});

test("tolerates leading indentation and CRLF line endings", () => {
  assert.equal(parseVerdict("  VERDICT: PASS\r\n"), "PASS");
  assert.equal(parseVerdict("intro\r\nVERDICT: ESCALATE\r\nrest"), "ESCALATE");
});

test("tolerates markdown emphasis and heading wrappers", () => {
  assert.equal(parseVerdict("**VERDICT: PASS**"), "PASS");
  assert.equal(parseVerdict("__VERDICT: FAIL__"), "FAIL");
  assert.equal(parseVerdict("## VERDICT: ESCALATE"), "ESCALATE");
  assert.equal(parseVerdict("### **VERDICT: PASS**"), "PASS");
  assert.equal(parseVerdict("**VERDICT:** FAIL"), "FAIL");
});

test("tolerates a fenced code block", () => {
  assert.equal(parseVerdict("```\nVERDICT: PASS\n```"), "PASS");
});

test("tolerates trailing punctuation", () => {
  assert.equal(parseVerdict("VERDICT: PASS."), "PASS");
  assert.equal(parseVerdict("VERDICT: ESCALATE:"), "ESCALATE");
  assert.equal(parseVerdict("**VERDICT: FAIL**."), "FAIL");
});

test("tolerates case drift on the token, normalizing the result", () => {
  assert.equal(parseVerdict("Verdict: PASS"), "PASS");
  assert.equal(parseVerdict("verdict: pass"), "PASS");
  assert.equal(parseVerdict("Verdict: Fail"), "FAIL");
});

test("takes the first verdict when the body quotes others", () => {
  assert.equal(parseVerdict("VERDICT: FAIL\n\nA prior run returned:\nVERDICT: PASS\n"), "FAIL");
});

// ── Verdicts the orchestrator must NOT accept ──────────────────────────────

test("rejects a verdict embedded mid-line in prose", () => {
  assert.equal(parseVerdict("My VERDICT: PASS on section 1, but see below."), null);
  assert.equal(parseVerdict("The contract says to emit VERDICT: FAIL when it does not match."), null);
});

test("rejects translated or unknown verdict values", () => {
  assert.equal(parseVerdict("VEREDICTO: PASS"), null);
  assert.equal(parseVerdict("VERDICT: APPROVED"), null);
  assert.equal(parseVerdict("VERDICT: PARTIAL PASS"), null);
  assert.equal(parseVerdict("VERDICT: PASS and FAIL"), null);
});

test("rejects output with no verdict at all", () => {
  assert.equal(parseVerdict("The build looks broadly correct.\n\nNo blocking issues."), null);
});

// ── Blockers ───────────────────────────────────────────────────────────────

test("detects a blocker on its own line, with or without emphasis", () => {
  assert.ok(hasBlocker("=== FILE: a.js ===\n...\n=== END FILE ===\n\nBLOCKER: schema unknown"));
  assert.ok(hasBlocker("**BLOCKER:** which table stores sessions?"));
  assert.ok(hasBlocker("  BLOCKER: indented still counts"));
  assert.ok(hasBlocker("## BLOCKER: as a heading"));
  assert.ok(hasBlocker("  blocker: lowercase still counts"));
});

test("ignores a blocker mentioned inside prose or a code comment", () => {
  assert.equal(hasBlocker("// no BLOCKER: was found in this file"), false);
  assert.equal(hasBlocker("Report it as BLOCKER: when a decision is uncovered."), false);
});
