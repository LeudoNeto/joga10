import { ArrowRightLeft, EllipsisVertical, Flame, Trash2, UserMinus } from "lucide-react";
import type { Player, Team } from "../../types";
import { Avatar, Card, IconButton, Menu, Select, cx } from "../../components/ui";
import { fmtDec, fmtSkill, readableOn } from "../../lib/format";

export function TeamStatsRow({ team, compact }: { team: Team; compact?: boolean }) {
  const s = team.stats;
  const items: [string, number | string, string][] = [
    ["J", s.played, "Jogos"],
    ["V", s.wins, "Vitórias"],
    ["E", s.draws, "Empates"],
    ["D", s.losses, "Derrotas"],
    ["GP", s.goals_for, "Gols feitos"],
    ["GC", s.goals_against, "Gols sofridos"],
    ["SG", s.goals_for - s.goals_against > 0 ? `+${s.goals_for - s.goals_against}` : s.goals_for - s.goals_against, "Saldo de gols"],
  ];
  return (
    <div className={cx("grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line", compact ? "text-[11px]" : "text-xs")}>
      {items.map(([label, value, title]) => (
        <div key={label} title={title} className="bg-surface-2/70 px-1 py-1.5 text-center">
          <div className="font-semibold uppercase tracking-wide text-subtle">{label}</div>
          <div className="mt-0.5 text-sm font-bold tabular text-fg">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function TeamCard({
  team,
  substitutes,
  editMode,
  otherTeams,
  available,
  onMove,
  onRemovePlayer,
  onAddPlayer,
  onRemoveTeam,
}: {
  team: Team;
  substitutes: number[]; // suplente notas (cents)
  editMode: boolean;
  otherTeams: Team[];
  available: Player[]; // players without a team (for "add")
  onMove: (playerId: number, toTeam: Team) => void;
  onRemovePlayer: (playerId: number) => void;
  onAddPlayer: (playerId: number) => void;
  onRemoveTeam: () => void;
}) {
  const color = team.color || "#dc2626";
  const onColor = readableOn(color);
  const sorted = [...team.players].sort((a, b) => b.skill - a.skill);
  const total = team.total_skill + substitutes.reduce((s, c) => s + c, 0) / 100;
  const size = team.players.length + substitutes.length;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative px-4 py-3" style={{ backgroundColor: color, color: onColor }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold tracking-tight">{team.name}</h3>
            <p className="text-xs opacity-85">
              {size} jogadores{team.players.length ? ` · média ${fmtSkill(team.avg_skill)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {team.stats.streak > 0 && (
              <span
                title={`${team.stats.streak} vitória(s) seguida(s)`}
                className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-xs font-bold"
              >
                <Flame size={12} /> {team.stats.streak}
              </span>
            )}
            {editMode && (
              <button
                type="button"
                onClick={onRemoveTeam}
                aria-label="Remover time"
                title="Remover time"
                className="rounded-lg p-1.5 opacity-80 hover:bg-black/15 hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <TeamStatsRow team={team} compact />
      </div>

      <ul className="flex-1 px-1.5 py-2">
        {sorted.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/50">
            <Avatar name={p.name} src={p.photo_url} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{p.name}</p>
              {p.position && <p className="truncate text-[11px] text-subtle">{p.position}</p>}
            </div>
            <span className="text-sm font-semibold tabular text-muted">{fmtSkill(p.skill)}</span>
            {editMode && (
              <Menu
                header="Mover para"
                trigger={(props) => <IconButton icon={EllipsisVertical} label={`Ações de ${p.name}`} size="sm" className="h-7 w-7" {...props} />}
                items={[
                  ...otherTeams.map((t) => ({
                    label: t.name,
                    icon: ArrowRightLeft,
                    color: t.color,
                    onClick: () => onMove(p.id, t),
                  })),
                  { label: "Tirar do time", icon: UserMinus, danger: true, onClick: () => onRemovePlayer(p.id) },
                ]}
              />
            )}
          </li>
        ))}
        {substitutes.map((c, i) => (
          <li key={`s${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-subtle">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-[10px] font-bold">
              SUP
            </span>
            <span className="flex-1 text-sm italic">Suplente</span>
            <span className="text-sm font-semibold tabular">{fmtSkill(c / 100)}</span>
          </li>
        ))}
        {!team.players.length && <li className="px-2 py-3 text-center text-sm text-subtle">Sem jogadores</li>}
      </ul>

      {editMode && (
        <div className="border-t border-line p-2">
          <Select
            value=""
            disabled={!available.length}
            onChange={(e) => e.target.value && onAddPlayer(Number(e.target.value))}
            className="h-9"
          >
            <option value="">{available.length ? "+ Adicionar jogador sem time..." : "Todos os jogadores já têm time"}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {fmtSkill(p.skill)}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
        <span className="font-medium text-muted">Força total</span>
        <span className="font-bold tabular" style={{ color }}>
          {fmtDec(total)}
        </span>
      </div>
    </Card>
  );
}
