import { describe, expect, it } from "vitest";
import { cabeNasVagas, calc_spread, estrutura_times, solveSync } from "./balance";
import { drawTeams, substitutesFor, type DrawPlayer } from "./draw";

// team-balance/input.txt (18 players) — its output.txt (heurístico, 4 times,
// sem suplentes) has totals 14.84 / 14.77 / 13.03 / 12.87, spread 1.97.
const INPUT = [480, 200, 300, 227, 400, 300, 350, 273, 210, 443, 320, 267, 267, 227, 387, 347, 313, 240];
const sorted = INPUT.slice().sort((a, b) => b - a);

const players: DrawPlayer[] = INPUT.map((c, i) => ({ id: i + 1, name: `J${i + 1}`, skill: c / 100 }));

describe("núcleo copiado do team-balance", () => {
  it("heurístico reproduz o output.txt do team-balance", () => {
    const est = estrutura_times(18, 4, true, false, 0);
    const res = solveSync(sorted, [{ base: est.base, cap: est.cap }], "heuristico");
    const totals = [0, 0, 0, 0];
    res.assign.forEach((t, i) => (totals[t] += sorted[i]));
    expect(totals.sort((a, b) => b - a)).toEqual([1484, 1477, 1303, 1287]);
    expect(res.spread).toBe(197);
  });

  it("ótimo nunca é pior que o heurístico e prova o resultado", () => {
    for (const k of [2, 3, 4]) {
      for (const subs of [true, false]) {
        const mean = Math.round(sorted.reduce((s, c) => s + c, 0) / sorted.length);
        const est = estrutura_times(sorted.length, k, true, subs, mean);
        const cand = [{ base: est.base, cap: est.cap }];
        const h = solveSync(sorted, cand, "heuristico");
        const o = solveSync(sorted, cand, "otimo");
        expect(o.spread).toBeLessThanOrEqual(h.spread);
        expect(o.provado).toBe(true);
        expect(calc_spread(o.assign, sorted, est.base)).toBe(o.spread);
      }
    }
  });

  it("estrutura com suplentes: 1 por time curto e tamanhos iguais", () => {
    const est = estrutura_times(17, 4, true, true, 300);
    expect(est.cap.slice().sort()).toEqual([4, 4, 4, 5]);
    expect(est.subs.reduce((a, b) => a + b, 0)).toBe(3);
    expect(cabeNasVagas([5, 0, 0, 0], est.cap)).toBe(true);
    expect(cabeNasVagas([5, 5, 0, 0], est.cap)).toBe(false);
  });
});

describe("drawTeams", () => {
  for (const mode of ["random", "heuristic", "optimal"] as const) {
    it(`${mode}: todos sorteados uma vez, tamanhos iguais e panelinha respeitada`, async () => {
      const pins = [[1, 2], [3]]; // 1 e 2 juntos no time 1; 3 separado deles
      const { teams } = await drawTeams({ players, numTeams: 4, mode, useSubstitutes: true, pins });
      const ids = teams.flat().sort((a, b) => a - b);
      expect(ids).toEqual(players.map((p) => p.id));
      const sizes = teams.map((t) => t.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(teams[0]).toEqual(expect.arrayContaining([1, 2]));
      expect(teams[1]).toContain(3);
    });
  }

  it("panelinha maior que o time é recusada", async () => {
    await expect(
      drawTeams({ players: players.slice(0, 6), numTeams: 3, mode: "optimal", useSubstitutes: false, pins: [[1, 2, 3]] })
    ).rejects.toThrow(/inviável/);
  });
});

describe("substitutesFor", () => {
  it("suplente fecha a diferença para a média dos times completos", () => {
    const t = (...skills: number[]) => skills.map((skill) => ({ skill }));
    const subs = substitutesFor([t(5, 5, 5), t(4, 6, 5), t(5, 5)], true);
    expect(subs).toEqual([[], [], [500]]);
    expect(substitutesFor([t(5, 5, 5), t(5, 5)], false)).toEqual([[], []]);
  });
});
