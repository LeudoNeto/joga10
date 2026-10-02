/** Team identities in draw order — must match TEAM_STYLES on the backend
 *  (the n-th drawn team is stored with the n-th style). */
export const TEAM_STYLES: { name: string; color: string }[] = [
  { name: "Time Vermelho", color: "#ef4444" },
  { name: "Time Azul", color: "#3b82f6" },
  { name: "Time Verde", color: "#22c55e" },
  { name: "Time Amarelo", color: "#eab308" },
  { name: "Time Roxo", color: "#8b5cf6" },
  { name: "Time Laranja", color: "#f97316" },
  { name: "Time Rosa", color: "#ec4899" },
  { name: "Time Ciano", color: "#06b6d4" },
  { name: "Time Cinza", color: "#6b7280" },
  { name: "Time Lima", color: "#84cc16" },
  { name: "Time Índigo", color: "#6366f1" },
  { name: "Time Marrom", color: "#92400e" },
];

export const MAX_TEAMS = TEAM_STYLES.length;

/** Backend datetimes are naive UTC: parse them as UTC. */
export function parseUtc(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}
