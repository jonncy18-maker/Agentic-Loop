/**
 * Verdict / blocker parsing for the Agentic Loop.
 *
 * Extracted from orchestrator.js so it can be tested without booting the
 * orchestrator (which validates env and would exit). These tokens are the only
 * machine-parsed part of any agent output — when a role's model changes, this is
 * the contract that has to keep holding. See test/verdict.test.mjs.
 *
 * The token must still OWN ITS LINE: a line-anchored match is what keeps an
 * auditor that discusses "VERDICT: PASS" mid-sentence from tripping the parser.
 * Within that constraint the match is deliberately forgiving — markdown emphasis,
 * heading markers, indentation, case, and trailing punctuation are all formatting
 * drift, not disagreement. A model that complies in substance must never cost an
 * iteration, because an unparseable verdict is expensive: a build that passed
 * gets thrown away.
 */

// Shared shape: [indent] [#…] [** or __] TOKEN: VALUE [** or __] [. or :]
const WRAP_OPEN = String.raw`[ \t]*#{0,6}[ \t]*(?:\*\*|__)?[ \t]*`;
const WRAP_CLOSE = String.raw`[ \t]*(?:\*\*|__)?[ \t]*[.:]?[ \t]*`;

export const VERDICT_RE = new RegExp(
  `^${WRAP_OPEN}VERDICT:${WRAP_CLOSE}?[ \\t]*(PASS|FAIL|ESCALATE)${WRAP_CLOSE}$`,
  "im"
);

export const BLOCKER_RE = new RegExp(`^${WRAP_OPEN}BLOCKER[:\\*_]`, "im");

export function parseVerdict(text) {
  const m = text.match(VERDICT_RE);
  return m ? m[1].toUpperCase() : null;
}

export function hasBlocker(text) {
  return BLOCKER_RE.test(text);
}
