/** A shields.io static badge for the score, as Markdown linked to the hosted check. */
export const BADGE_LINK = "https://latitude10.tech/agent-readiness";

/** green at 80 or more, yellow at 50 or more, red below 50. */
export function badgeColor(score: number): "green" | "yellow" | "red" {
  return score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
}

export function badge(score: number): string {
  return `[![agent-ready](https://img.shields.io/badge/agent--ready-${score}%2F100-${badgeColor(score)})](${BADGE_LINK})`;
}
