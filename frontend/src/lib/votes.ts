import type { Player, PlayerVote } from "../types";

const NICE_STEPS = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10];

/** Buttons offered to vote: about 11 evenly spaced notas covering the group
 * range (0-10 -> 0, 1, ..., 10; 0-5 -> 0, 0.5, ..., 5), always including the
 * minimum and the maximum. */
export function voteOptions(min: number, max: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const step = NICE_STEPS.find((s) => span / s <= 10) ?? Math.ceil(span / 10);
  const first = Math.ceil(min / step - 1e-9);
  const values = new Set([min, max]);
  for (let i = first; i * step <= max + 1e-9; i++) values.add(Math.round(i * step * 100) / 100);
  return [...values].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

export type VoteSection = "pending" | "unknown" | "voted";

export const VOTE_SECTIONS: VoteSection[] = ["pending", "unknown", "voted"];

/** Not voted yet (new players / first voting), "Não sei", or already voted. */
export function voteSection(vote: PlayerVote | undefined): VoteSection {
  return !vote ? "pending" : vote.skill === null ? "unknown" : "voted";
}

/** Players the member can vote on (active ones, except themselves), grouped
 * by section in display order and sorted by name. */
export function groupForVoting(
  players: Player[],
  votes: Map<number, PlayerVote>,
  selfId: number | null
): Record<VoteSection, Player[]> {
  const out: Record<VoteSection, Player[]> = { pending: [], unknown: [], voted: [] };
  const sorted = players
    .filter((p) => p.active && p.id !== selfId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  for (const p of sorted) out[voteSection(votes.get(p.id))].push(p);
  return out;
}

/** Same nota up to the 2 decimals the app works with. */
export const sameSkill = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Same vote: both "Não sei" (null), both missing, or the same nota. */
export const sameVote = (a: number | null | undefined, b: number | null | undefined) =>
  a === b || (typeof a === "number" && typeof b === "number" && sameSkill(a, b));

/** Votes still pending once `sent` was saved: a vote changed again while the
 * request was going stays pending (with its newer value). */
export function withoutSent<K>(pending: Map<K, number | null>, sent: Map<K, number | null>) {
  const next = new Map(pending);
  for (const [key, value] of sent) if (next.has(key) && sameVote(next.get(key), value)) next.delete(key);
  return next;
}

/** Wait before retrying a failed save: 2s, 4s, 8s, then every 15s. */
export const retryDelay = (failures: number) => Math.min(15_000, 1000 * 2 ** failures);

/** Nota typed in the "Personalizado" input ("7,25" or "7.25"), rounded to 2
 * decimals; null when it is not a number inside the group range. */
export function parseVote(text: string, min: number, max: number): number | null {
  const raw = text.trim().replace(",", ".");
  const value = Math.round(Number(raw) * 100) / 100;
  return raw && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
