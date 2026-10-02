/* Team draw on the client (port of gerar()/montarTimes()/
   ajustarNotasSuplentes() from team-balance). The search runs in a Web Worker;
   the backend only validates and stores the resulting teams. */

import {
  candidatosPanelinha,
  estrutura_times,
  solveSync,
  type Candidato,
  type Resultado,
} from "./balance";
import type { DrawMode } from "../types";

export interface DrawPlayer {
  id: number;
  name: string;
  skill: number;
}

export interface DrawInput {
  players: DrawPlayer[]; // the players taking part
  numTeams: number;
  mode: DrawMode;
  useSubstitutes: boolean;
  pins: number[][]; // pins[j] = ids fixed to team j ("panelinha")
}

export interface DrawOutput {
  teams: number[][]; // player ids per team, in team order
  proven: boolean; // false when the optimal search hit its time limit
}

export const MODE_LABELS: Record<DrawMode, string> = {
  optimal: "Ótimo",
  heuristic: "Heurístico",
  random: "Aleatório",
};

export const cents = (skill: number) => Math.round(skill * 100);

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Web Worker keeps the page responsive during the optimal search; falls back
   to running on the main thread when workers are unavailable. */
function solve(
  scores: number[],
  candidatos: Candidato[],
  algoritmo: "otimo" | "heuristico"
): Promise<Resultado> {
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./balance.worker.ts", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) {
      setTimeout(() => resolve(solveSync(scores, candidatos, algoritmo)), 0);
      return;
    }
    const w = worker;
    w.onmessage = (ev: MessageEvent<Resultado>) => {
      resolve(ev.data);
      w.terminate();
    };
    w.onerror = () => {
      w.terminate();
      resolve(solveSync(scores, candidatos, algoritmo));
    };
    w.postMessage({ scores, candidatos, algoritmo });
  });
}

/** Real-player capacity of each team (same for both substitute modes). */
export function capacidades(n: number, k: number): number[] {
  return estrutura_times(n, k, true, false, 0).cap;
}

export async function drawTeams(input: DrawInput): Promise<DrawOutput> {
  const { players, numTeams: k, mode, useSubstitutes } = input;
  const n = players.length;
  if (!(k >= 2 && k <= n)) throw new Error(`Escolha entre 2 e ${n} times.`);

  let soma = 0;
  for (const p of players) soma += cents(p.skill);
  const mediaC = Math.round(soma / n);
  // Substitutes only matter for balancing; a random draw ignores notas.
  const est = estrutura_times(n, k, true, useSubstitutes && mode !== "random", mediaC);

  /* Panelinha: quem está fixado sai da otimização e vira parte do 'base' —
     soma no total do time e consome uma vaga, então o solver equilibra apenas
     o que sobrou, sem nunca poder separar a panelinha. */
  const byId = new Map(players.map((p) => [p.id, p]));
  const grupos: DrawPlayer[][] = [];
  for (let j = 0; j < k; j++) {
    grupos.push((input.pins[j] ?? []).map((id) => byId.get(id)).filter((p): p is DrawPlayer => !!p));
  }
  const presos = new Set(grupos.flat().map((p) => p.id));
  const counts = grupos.map((g) => g.length);
  const sums = grupos.map((g) => g.reduce((s, p) => s + cents(p.skill), 0));

  const arranjos = candidatosPanelinha(est, counts, sums);
  if (!arranjos.length) {
    throw new Error("Panelinha inviável: há mais jogadores fixados do que vagas no time.");
  }

  const livres = players.filter((p) => !presos.has(p.id));
  const teams = grupos.map((g) => g.map((p) => p.id));
  let proven = true;

  if (mode === "random") {
    const arranjo = arranjos[Math.floor(Math.random() * arranjos.length)];
    const slots: number[] = [];
    for (let j = 0; j < k; j++) for (let q = 0; q < arranjo.cap[j] - counts[j]; q++) slots.push(j);
    shuffle(livres).forEach((p, i) => teams[slots[i]].push(p.id));
  } else {
    // cada arranjo já leva os presos embutidos (base += soma, cap -= presos)
    const candidatos = arranjos.map((a) => ({
      base: a.base.map((b, j) => b + sums[j]),
      cap: a.cap.map((c, j) => c - counts[j]),
    }));
    // Shuffle before the (stable) sort: players with equal notas don't always
    // land in the same team when the draw is repeated.
    const ordenados = shuffle(livres).sort((a, b) => cents(b.skill) - cents(a.skill));
    const res = await solve(
      ordenados.map((p) => cents(p.skill)),
      candidatos,
      mode === "optimal" ? "otimo" : "heuristico"
    );
    ordenados.forEach((p, i) => teams[res.assign[i]].push(p.id));
    proven = res.provado;
  }

  // Without pins the teams are interchangeable: vary which colour gets which
  // squad instead of always giving the strongest player to the first team.
  return { teams: presos.size ? teams : shuffle(teams), proven };
}

/* ---------------------------------------------------------------------
   Suplentes (display). Teams smaller than the largest one get one
   substitute per missing player, whose nota closes the gap to the average
   total of the complete teams (ajustarNotasSuplentes). Derived from the
   current teams, so it stays right after manual changes.
   --------------------------------------------------------------------- */
export function substitutesFor(teams: { skill: number }[][], enabled: boolean): number[][] {
  const sizes = teams.map((t) => t.length);
  const largest = Math.max(0, ...sizes);
  if (!enabled || teams.every((t) => t.length === largest || t.length === 0)) {
    return teams.map(() => []);
  }
  const total = (t: { skill: number }[]) => t.reduce((s, p) => s + cents(p.skill), 0);
  const complete = teams.filter((t) => t.length === largest);
  const alvo = Math.round(complete.reduce((s, t) => s + total(t), 0) / complete.length);
  return teams.map((t) => {
    const missing = t.length > 0 ? largest - t.length : 0;
    if (!missing) return [];
    const falta = Math.max(0, alvo - total(t));
    const base = Math.floor(falta / missing);
    const resto = falta % missing;
    return Array.from({ length: missing }, (_, i) => base + (i < resto ? 1 : 0));
  });
}

/** Spread (strongest - weakest total, in cents) counting substitutes. */
export function spreadCents(teams: { skill: number }[][], subs: number[][]): number {
  const totals = teams
    .map((t, j) => t.reduce((s, p) => s + cents(p.skill), 0) + subs[j].reduce((s, c) => s + c, 0))
    .filter((_, j) => teams[j].length > 0);
  return totals.length ? Math.max(...totals) - Math.min(...totals) : 0;
}
