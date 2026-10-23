import { describe, expect, it } from "vitest";
import type { Player, PlayerVote } from "../types";
import { groupForVoting, parseVote, voteOptions } from "./votes";

describe("voteOptions", () => {
  it("uses whole numbers for 0-10", () => {
    expect(voteOptions(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(voteOptions(1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("uses half points for 0-5 and tens for 0-100", () => {
    expect(voteOptions(0, 5)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
    expect(voteOptions(0, 100)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("always includes both ends of the range", () => {
    expect(voteOptions(0.5, 9.5)).toEqual([0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5]);
  });
});

describe("groupForVoting", () => {
  const player = (id: number, name: string, active = true) => ({ id, name, active }) as Player;
  const vote = (player_id: number, skill: number | null) => ({ player_id, skill, updated_at: "" }) as PlayerVote;

  it("splits pending, unknown and voted, skipping the voter", () => {
    const players = [player(1, "Zé"), player(2, "Ana"), player(3, "Bia", false), player(4, "Caio"), player(5, "Eu")];
    const votes = new Map([
      [4, vote(4, 7)],
      [2, vote(2, null)],
    ]);
    const s = groupForVoting(players, votes, 5);
    expect(s.pending.map((p) => p.name)).toEqual(["Zé", "Bia"]); // active first
    expect(s.unknown.map((p) => p.name)).toEqual(["Ana"]);
    expect(s.voted.map((p) => p.name)).toEqual(["Caio"]);
  });
});

describe("parseVote", () => {
  it("accepts comma or dot decimals inside the range", () => {
    expect(parseVote("7,25", 0, 10)).toBe(7.25);
    expect(parseVote(" 3.333 ", 0, 10)).toBe(3.33);
    expect(parseVote("0", 0, 10)).toBe(0);
  });

  it("rejects empty, invalid and out of range text", () => {
    expect(parseVote("", 0, 10)).toBeNull();
    expect(parseVote("abc", 0, 10)).toBeNull();
    expect(parseVote("10,5", 0, 10)).toBeNull();
    expect(parseVote("0,5", 1, 10)).toBeNull();
  });
});
