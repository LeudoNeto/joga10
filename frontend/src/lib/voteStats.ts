import type { VoteStats, VoteStatsPlayer, VoteStatsVote, VoteStatsVoter } from "../types";
import { voteOptions } from "./votes";

/** Notas, "Não sei" and expected votes not cast, in a slice of the voting. */
export interface Coverage {
  score: number;
  unknown: number;
  missing: number;
  total: number;
}

export interface StatsIndex {
  options: number[]; // nota buckets of the charts (the voting buttons)
  min: number;
  max: number;
  players: VoteStatsPlayer[]; // by name
  voters: VoteStatsVoter[]; // every member
  active: VoteStatsPlayer[]; // players in the voting
  /** Members who can vote (linked to a player) or did vote, by name. */
  electorate: VoteStatsVoter[];
  playerById: Map<number, VoteStatsPlayer>;
  voterById: Map<number, VoteStatsVoter>;
  byPlayer: Map<number, VoteStatsVote[]>;
  byVoter: Map<number, VoteStatsVote[]>;
}

/** How a voter is known in the group: their player's name, else the account's. */
export const voterName = (v: VoteStatsVoter) => v.player_name ?? v.name;

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR");

function groupBy<K>(votes: VoteStatsVote[], key: (v: VoteStatsVote) => K) {
  const out = new Map<K, VoteStatsVote[]>();
  for (const v of votes) out.set(key(v), [...(out.get(key(v)) ?? []), v]);
  return out;
}

export function indexStats(data: VoteStats): StatsIndex {
  const byVoter = groupBy(data.votes, (v) => v.voter_id);
  const players = [...data.players].sort((a, b) => byName(a.name, b.name));
  return {
    options: voteOptions(data.min_skill, data.max_skill),
    min: data.min_skill,
    max: data.max_skill,
    players,
    voters: data.voters,
    active: players.filter((p) => p.active),
    electorate: data.voters
      .filter((v) => v.player_id !== null || byVoter.has(v.user_id))
      .sort((a, b) => byName(voterName(a), voterName(b))),
    playerById: new Map(players.map((p) => [p.id, p])),
    voterById: new Map(data.voters.map((v) => [v.user_id, v])),
    byPlayer: groupBy(data.votes, (v) => v.player_id),
    byVoter,
  };
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Standard deviation (how divided the votes are); null under 2 votes. */
export function spread(values: number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

/** Bucket of a nota: the nearest option (ties go up), so a custom 7,25 counts as 7. */
export function bucketIndex(value: number, options: number[]): number {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if (Math.abs(options[i] - value) <= Math.abs(options[best] - value) + 1e-9) best = i;
  }
  return best;
}

export function bucketize<T>(items: T[], valueOf: (item: T) => number, options: number[]): T[][] {
  const out = options.map(() => [] as T[]);
  for (const item of items) out[bucketIndex(valueOf(item), options)].push(item);
  return out;
}

const scoreOf = (v: VoteStatsVote) => v.skill as number;
const isScore = (v: VoteStatsVote) => v.skill !== null;

/** Players a voter is asked to rate: the active ones, except their own. */
export function expectedPlayers(idx: StatsIndex, voter: VoteStatsVoter): VoteStatsPlayer[] {
  return idx.active.filter((p) => p.id !== voter.player_id);
}

/** Members asked to rate a player: the electorate except the player's own
 * member. Nobody, for an inactive player (out of the voting). */
export function expectedVoters(idx: StatsIndex, player: VoteStatsPlayer): VoteStatsVoter[] {
  return player.active ? idx.electorate.filter((v) => v.player_id !== player.id) : [];
}

function coverage(votes: VoteStatsVote[], expected: number): Coverage {
  const score = votes.filter(isScore).length;
  const unknown = votes.length - score;
  return { score, unknown, missing: Math.max(0, expected - votes.length), total: Math.max(expected, votes.length) };
}

export function voterCoverage(idx: StatsIndex, voter: VoteStatsVoter): Coverage {
  const expected = new Set(expectedPlayers(idx, voter).map((p) => p.id));
  const votes = (idx.byVoter.get(voter.user_id) ?? []).filter((v) => expected.has(v.player_id));
  return coverage(votes, expected.size);
}

/** The whole voting: every voter of the electorate × the players asked of them. */
export function overallCoverage(idx: StatsIndex): Coverage {
  const total: Coverage = { score: 0, unknown: 0, missing: 0, total: 0 };
  for (const voter of idx.electorate) {
    const c = voterCoverage(idx, voter);
    total.score += c.score;
    total.unknown += c.unknown;
    total.missing += c.missing;
    total.total += c.total;
  }
  return total;
}

/** Votes on active players (the ones in the voting). */
export function activeVotes(idx: StatsIndex): VoteStatsVote[] {
  return idx.active.flatMap((p) => idx.byPlayer.get(p.id) ?? []);
}

export interface PlayerVoting {
  scores: VoteStatsVote[]; // highest nota first
  unknown: VoteStatsVote[];
  missing: VoteStatsVoter[]; // asked to vote, did not
  coverage: Coverage;
  mean: number | null;
  min: number | null;
  max: number | null;
  spread: number | null;
}

export function playerVoting(idx: StatsIndex, player: VoteStatsPlayer): PlayerVoting {
  const votes = idx.byPlayer.get(player.id) ?? [];
  const scores = votes
    .filter(isScore)
    .sort((a, b) => scoreOf(b) - scoreOf(a) || byName(nameOf(idx, a), nameOf(idx, b)));
  const values = scores.map(scoreOf);
  const voted = new Set(votes.map((v) => v.voter_id));
  const expected = expectedVoters(idx, player);
  return {
    scores,
    unknown: votes.filter((v) => !isScore(v)).sort((a, b) => byName(nameOf(idx, a), nameOf(idx, b))),
    missing: expected.filter((v) => !voted.has(v.user_id)),
    coverage: coverage(votes, expected.length),
    mean: mean(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    spread: spread(values),
  };
}

const nameOf = (idx: StatsIndex, v: VoteStatsVote) => {
  const voter = idx.voterById.get(v.voter_id);
  return voter ? voterName(voter) : "";
};

export interface VoterVoting {
  scores: VoteStatsVote[]; // highest nota first
  unknown: VoteStatsVote[];
  missing: VoteStatsPlayer[]; // active players not rated yet
  coverage: Coverage;
  mean: number | null;
  /** Average of the others' votes, per player this voter rated. */
  othersMean: Map<number, number>;
  /** Mean of (their nota − the others' average) where others voted too:
   * positive = more generous than the group, negative = stricter. */
  bias: number | null;
}

export function voterVoting(idx: StatsIndex, voter: VoteStatsVoter): VoterVoting {
  const votes = idx.byVoter.get(voter.user_id) ?? [];
  const playerName = (v: VoteStatsVote) => idx.playerById.get(v.player_id)?.name ?? "";
  const scores = votes.filter(isScore).sort((a, b) => scoreOf(b) - scoreOf(a) || byName(playerName(a), playerName(b)));
  const othersMean = new Map<number, number>();
  const diffs: number[] = [];
  for (const v of scores) {
    const others = (idx.byPlayer.get(v.player_id) ?? []).filter((o) => o.voter_id !== voter.user_id && isScore(o));
    const m = mean(others.map(scoreOf));
    if (m === null) continue;
    othersMean.set(v.player_id, m);
    diffs.push(scoreOf(v) - m);
  }
  const voted = new Set(votes.map((v) => v.player_id));
  return {
    scores,
    unknown: votes.filter((v) => !isScore(v)).sort((a, b) => byName(playerName(a), playerName(b))),
    missing: expectedPlayers(idx, voter).filter((p) => !voted.has(p.id)),
    coverage: voterCoverage(idx, voter),
    mean: mean(scores.map(scoreOf)),
    othersMean,
    bias: mean(diffs),
  };
}

/** Share of a whole, rounded for display (0 when the whole is empty). */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
