/** Where a static badge links: the hosted check. */
export const BADGE_LINK = "https://latitude10.tech/agent-readiness";

/** The shields.io endpoint that scores a spec URL (cached for a day, by latitude10.tech). */
export const LIVE_BADGE_ENDPOINT = "https://latitude10.tech/api/readiness/badge";
/** The free check page a live badge links to. */
export const LIVE_BADGE_PAGE = "https://latitude10.tech/agent-readiness/check";

/** green at 80 or more, yellow at 50 or more, red below 50. The live badge uses the same thresholds. */
export function badgeColor(score: number): "green" | "yellow" | "red" {
  return score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
}

/** A shields.io static badge for one score, as Markdown linked to the hosted check. */
export function badge(score: number): string {
  return `[![agent-ready](https://img.shields.io/badge/agent--ready-${score}%2F100-${badgeColor(score)})](${BADGE_LINK})`;
}

/**
 * A live badge for a spec at a public https URL, as Markdown: shields.io asks latitude10.tech for the
 * current score, so the badge follows the spec. It links to the free check page for that URL.
 */
export function liveBadge(specUrl: string): string {
  const endpoint = encodeURIComponent(`${LIVE_BADGE_ENDPOINT}?url=${encodeURIComponent(specUrl)}`);
  return `[![agent-ready](https://img.shields.io/endpoint?url=${endpoint})](${LIVE_BADGE_PAGE}?url=${encodeURIComponent(specUrl)})`;
}
