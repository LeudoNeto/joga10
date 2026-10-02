import { ApiError } from "../api/client";
import type { Role } from "../types";

export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Nota for the UI: compact, pt-BR decimal comma (8 | 8,5 | 8,75). */
export function fmtSkill(value: number) {
  return (Math.round(value * 100) / 100).toString().replace(".", ",");
}

/** Nota with exactly two decimals (exports, as in team-balance). */
export function fmt2(value: number) {
  return value.toFixed(2);
}

/** Two decimals with the pt-BR comma, for the UI. */
export function fmtDec(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export const isStaff = (role: Role) => role === "admin" || role === "moderator";

/** Suggestions for the free-text position field. */
export const POSITIONS = [
  "Goleiro",
  "Zagueiro",
  "Lateral",
  "Volante",
  "Meia",
  "Ponta",
  "Atacante",
  "Fixo",
  "Ala",
  "Pivô",
];

/** Text color (black/white) readable on top of a team colour. */
export function readableOn(hex: string | null | undefined) {
  const h = (hex || "#dc2626").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#18181b" : "#ffffff";
}
