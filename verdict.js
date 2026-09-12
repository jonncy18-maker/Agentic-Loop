/**
 * Verdict / blocker parsing for the Agentic Loop.
 *
 * Extracted from orchestrator.js so it can be tested without booting the
 * orchestrator (which validates env and would exit). These tokens are the only
 * machine-parsed part of any agent output — when a role's model changes, this is
 * the contract that has to keep holding. See test/verdict.test.mjs.
 *
 * The verdict line stays line-anchored, uppercase and English (the audit system
 * prompt demands exactly that), but markdown emphasis and heading wrappers are
 * tolerated: a model that writes `**VERDICT: PASS**` has complied in substance,
 * and rejecting it would burn an iteration on formatting.
 */

export const VERDICT_RE =
  /^[ \t]*#{0,6}[ \t]*(?:\*\*|__)?[ \t]*VERDICT:[ \t]*(PASS|FAIL|ESCALATE)[ \t]*(?:\*\*|__)?[ \t]*$/m;

// BLOCKER must open its own line to avoid false positives from prose or code comments
export const BLOCKER_RE = /^[ \t]*(?:\*\*|__)?BLOCKER:/im;

export function parseVerdict(text) {
  const m = text.match(VERDICT_RE);
  return m ? m[1] : null;
}

export function hasBlocker(text) {
  return BLOCKER_RE.test(text);
}
