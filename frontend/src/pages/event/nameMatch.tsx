import type { NameMatchRow, Player } from "../../types";
import { Badge, Select } from "../../components/ui";

/** Review of a pasted list whose names were matched to the group's players
 * (services/name_match on the server): each row picks a player. */

/** How the server matched the name, kept up to date with what is picked since. */
export type RowState = NameMatchRow["status"] | "chosen" | "created";

const STATUS: Record<RowState, { label: string; tone: "green" | "amber" | "brand" | "neutral" | "blue" }> = {
  matched: { label: "encontrado", tone: "green" },
  similar: { label: "parecido", tone: "amber" },
  ambiguous: { label: "escolha um", tone: "amber" },
  not_found: { label: "não encontrado", tone: "brand" },
  duplicate: { label: "repetido", tone: "neutral" },
  chosen: { label: "escolhido", tone: "green" },
  created: { label: "novo", tone: "blue" },
};

export function RowBadge({ state }: { state: RowState }) {
  return <Badge tone={STATUS[state].tone}>{STATUS[state].label}</Badge>;
}

/** State of each row given the picked players; a player picked again is
 * "repetido" from the second row on. ``created``: players registered here. */
export function rowStates(
  rows: Pick<NameMatchRow, "status" | "player_id">[],
  picks: (number | null)[],
  created: Set<number> = new Set()
): RowState[] {
  const seen = new Set<number>();
  return rows.map((r, i) => {
    const id = picks[i];
    if (id == null) return r.status === "not_found" ? "not_found" : "ambiguous";
    if (seen.has(id)) return "duplicate";
    seen.add(id);
    if (created.has(id)) return "created";
    if (id === r.player_id) return r.status === "similar" ? "similar" : "matched";
    return "chosen";
  });
}

/** How many rows picked each player. */
export function countPicks(picks: (number | null)[]) {
  const count = new Map<number, number>();
  for (const id of picks) if (id != null) count.set(id, (count.get(id) ?? 0) + 1);
  return count;
}

/** Player of a row: suggestions (ambiguous names) first; players picked by
 * another row go last, since the missing ones are usually among the rest. */
export function MatchSelect({
  name,
  candidates,
  value,
  roster,
  pickCount,
  onChange,
}: {
  name: string;
  candidates: NameMatchRow["candidates"];
  value: number | null;
  roster: Player[];
  pickCount: Map<number, number>;
  onChange: (playerId: number | null) => void;
}) {
  const suggested = new Set(candidates.map((c) => c.id));
  const elsewhere = (p: Player) => (pickCount.get(p.id) ?? 0) > (value === p.id ? 1 : 0);
  const rest = roster.filter((p) => !suggested.has(p.id));
  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      aria-label={`Jogador do grupo para ${name}`}
    >
      <option value="">Escolha o jogador...</option>
      <PlayerOptions label="Sugestões" players={roster.filter((p) => suggested.has(p.id))} />
      <PlayerOptions label="Jogadores" players={rest.filter((p) => !elsewhere(p))} />
      <PlayerOptions label="Já escolhidos" players={rest.filter(elsewhere)} />
    </Select>
  );
}

function PlayerOptions({ label, players }: { label: string; players: Player[] }) {
  if (!players.length) return null;
  return (
    <optgroup label={label}>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.active ? p.name : `${p.name} (inativo)`}
        </option>
      ))}
    </optgroup>
  );
}

/** The group's players by name, for the selects. */
export function sortedRoster(players: Player[]) {
  return [...players].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Column titles of the review list (shown from sm up; rows stack on phones). */
export function ListHeader() {
  return (
    <div className="sticky top-0 z-10 hidden grid-cols-2 gap-3 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-subtle sm:grid">
      <span>Na lista</span>
      <span>Jogador do grupo</span>
    </div>
  );
}
