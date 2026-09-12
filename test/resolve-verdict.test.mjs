import test from "node:test";
import assert from "node:assert/strict";
import { resolveVerdict } from "../orchestrator.js";

// A readable verdict must never trigger a second API call.
test("returns the parsed verdict without re-asking", async () => {
  let calls = 0;
  const ask = async () => { calls++; return "VERDICT: PASS"; };
  const { verdict, reaskOutput } = await resolveVerdict("VERDICT: FAIL\n\n[1] → x → y", ask);
  assert.equal(verdict, "FAIL");
  assert.equal(reaskOutput, null);
  assert.equal(calls, 0);
});

// The case this whole path exists for: the audit is sound, only its token is unreadable.
// Synthesizing a FAIL here would throw away a build that passed.
test("recovers a PASS whose token was unparseable", async () => {
  const audit = "The build satisfies every criterion.\n\nMy verdict is: it passes.";
  const ask = async () => "VERDICT: PASS";
  const { verdict } = await resolveVerdict(audit, ask);
  assert.equal(verdict, "PASS");
});

test("passes the original audit text to the re-ask", async () => {
  const audit = "Criterion 2 not met — missing exclamation mark.";
  let seen = null;
  const ask = async (_system, message) => { seen = message; return "VERDICT: FAIL"; };
  const { verdict, reaskOutput } = await resolveVerdict(audit, ask);
  assert.ok(seen.includes(audit), "re-ask must include the audit output verbatim");
  assert.equal(verdict, "FAIL");
  assert.equal(reaskOutput, "VERDICT: FAIL");
});

// Still unreadable → null, so the caller escalates rather than guessing a verdict.
test("returns null when the re-ask is also unparseable", async () => {
  const ask = async () => "I am not sure what the verdict should be.";
  const { verdict, reaskOutput } = await resolveVerdict("no verdict here", ask);
  assert.equal(verdict, null);
  assert.equal(reaskOutput, "I am not sure what the verdict should be.");
});

test("re-asks exactly once, never in a loop", async () => {
  let calls = 0;
  const ask = async () => { calls++; return "still no token"; };
  await resolveVerdict("no verdict here", ask);
  assert.equal(calls, 1);
});
