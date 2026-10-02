/* Plain-text exports (paste into WhatsApp & co). The teams layout follows
   team-balance's formatar_resultado. */
import type { EventItem, RankingRow } from "../types";
import { formatDate, fmt2 } from "./format";

export interface ExportTeam {
  name: string;
  players: { name: string; skill: number }[];
  substitutes: number[]; // suplente notas in cents
}

export interface TeamsExport {
  event: EventItem;
  teams: ExportTeam[];
  algorithm: string | null; // label, e.g. "Ótimo"
  proven: boolean;
  spreadCents: number;
  showSkills: boolean;
}

const bar = (c: string) => c.repeat(46);
const centsText = (c: number) => fmt2(c / 100);

export function teamsText(data: TeamsExport): string {
  const L: string[] = [bar("="), `TIMES — ${data.event.title} (${formatDate(data.event.date)})`, bar("=")];
  if (data.algorithm) L.push(`Algoritmo: ${data.algorithm}`);
  if (!data.proven) L.push("(otimalidade não provada no tempo limite; melhor solução encontrada)");

  const totals: number[] = [];
  for (const team of data.teams) {
    const real = team.players.reduce((s, p) => s + Math.round(p.skill * 100), 0);
    const total = real + team.substitutes.reduce((s, c) => s + c, 0);
    if (team.players.length) totals.push(total);
    const size = team.players.length + team.substitutes.length;
    let comp = `${size} jogadores`;
    if (team.substitutes.length) comp += `, sendo ${team.substitutes.length} suplente(s)`;
    L.push("");
    L.push(
      data.showSkills
        ? `${team.name}  (${comp})  —  nota total: ${centsText(total)}`
        : `${team.name}  (${comp})`
    );
    const sorted = team.players.slice().sort((a, b) => b.skill - a.skill);
    for (const p of sorted) {
      L.push(data.showSkills ? `   • ${p.name.padEnd(22)} ${fmt2(p.skill)}` : `   • ${p.name}`);
    }
    for (const c of team.substitutes) {
      L.push(data.showSkills ? `   • ${"Suplente".padEnd(22)} ${centsText(c)}   (suplente)` : "   • Suplente");
    }
  }
  if (data.showSkills && totals.length) {
    const maior = Math.max(...totals);
    const menor = Math.min(...totals);
    L.push(
      "",
      bar("-"),
      `Maior nota de time: ${centsText(maior)}`,
      `Menor nota de time: ${centsText(menor)}`,
      `Diferença (spread): ${centsText(maior - menor)}`,
      bar("-")
    );
  }
  return L.join("\n");
}

export const RANKING_FORMULA =
  "Gol = 4 pts (+1 meio-campista, +2 defensor/goleiro) · Assistência = 3 pts · líder = 100";

export function rankingText(event: EventItem, rows: RankingRow[]): string {
  const L: string[] = [bar("="), `RANKING — ${event.title} (${formatDate(event.date)})`, bar("=")];
  for (const r of rows) {
    const pos = r.position ? ` (${r.position})` : "";
    L.push(
      `${String(r.rank).padStart(2)}. ${(r.name + pos).padEnd(28)} ${String(r.score).padStart(3)} pts` +
        `  ·  ${r.goals} G  ${r.assists} A`
    );
  }
  L.push(bar("-"), RANKING_FORMULA);
  return L.join("\n");
}
