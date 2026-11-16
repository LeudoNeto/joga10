import { describe, expect, it } from "vitest";
import type { VoteStats } from "../types";
import {
  bucketIndex,
  bucketize,
  indexStats,
  overallCoverage,
  playerVoting,
  spread,
  voterCoverage,
  voterVoting,
} from "./voteStats";

const player = (id: number, name: string, active = true) =>
  ({ id, name, active, skill: 5, vote_skill: null, vote_count: 0 }) as VoteStats["players"][number];
const voter = (user_id: number, name: string, player_id: number | null) =>
  ({ user_id, name, role: "member", player_id, player_name: null, photo_url: null }) as VoteStats["voters"][number];
const vote = (voter_id: number, player_id: number, skill: number | null) => ({ voter_id, player_id, skill, updated_at: "" });

// Ana (player 1), Bia (player 2) and Caio (player 3) vote; Duda has no player
// and never voted (out of the electorate). Player 4 is inactive.
const data: VoteStats = {
  min_skill: 0,
  max_skill: 10,
  players: [player(1, "Ana"), player(2, "Bia"), player(3, "Caio"), player(4, "Zeca", false)],
  voters: [voter(10, "Ana", 1), voter(20, "Bia", 2), voter(30, "Caio", 3), voter(40, "Duda", null)],
  votes: [
    vote(10, 2, 8),
    vote(10, 3, 6),
    vote(20, 1, 7),
    vote(20, 3, null),
    vote(30, 2, 6),
    vote(30, 4, 9), // inactive player: outside the coverage
  ],
};

describe("buckets", () => {
  it("puts a custom nota in the nearest button, ties going up", () => {
    const options = [0, 1, 2];
    expect(bucketIndex(1.25, options)).toBe(1);
    expect(bucketIndex(1.5, options)).toBe(2);
    expect(bucketIndex(-3, options)).toBe(0);
    expect(bucketize([0.2, 1.9, 2], (v) => v, options)).toEqual([[0.2], [], [1.9, 2]]);
  });

  it("measures how divided the votes are", () => {
    expect(spread([5])).toBeNull();
    expect(spread([4, 6])).toBe(1);
  });
});

describe("coverage", () => {
  const idx = indexStats(data);

  it("expects each linked member to rate the other active players", () => {
    expect(idx.electorate.map((v) => v.name)).toEqual(["Ana", "Bia", "Caio"]);
    expect(voterCoverage(idx, idx.voterById.get(20)!)).toEqual({ score: 1, unknown: 1, missing: 0, total: 2 });
    // Caio's vote on the inactive player is not part of the voting.
    expect(voterCoverage(idx, idx.voterById.get(30)!)).toEqual({ score: 1, unknown: 0, missing: 1, total: 2 });
    expect(overallCoverage(idx)).toEqual({ score: 4, unknown: 1, missing: 1, total: 6 });
  });

  it("summarizes a player's votes", () => {
    const bia = playerVoting(idx, idx.playerById.get(2)!);
    expect(bia.scores.map((v) => v.skill)).toEqual([8, 6]);
    expect([bia.mean, bia.min, bia.max]).toEqual([7, 6, 8]);
    const caio = playerVoting(idx, idx.playerById.get(3)!);
    expect(caio.unknown.map((v) => v.voter_id)).toEqual([20]);
    expect(caio.missing).toEqual([]);
    const ana = playerVoting(idx, idx.playerById.get(1)!);
    expect(ana.missing.map((v) => v.name)).toEqual(["Caio"]);
  });

  it("compares a voter with the others", () => {
    // Ana gave Bia 8 (others: 6) and Caio 6 (nobody else rated him).
    const ana = voterVoting(idx, idx.voterById.get(10)!);
    expect(ana.bias).toBe(2);
    expect(ana.othersMean.get(2)).toBe(6);
    expect(ana.othersMean.has(3)).toBe(false);
    expect(voterVoting(idx, idx.voterById.get(30)!).missing.map((p) => p.name)).toEqual(["Ana"]);
  });
});
