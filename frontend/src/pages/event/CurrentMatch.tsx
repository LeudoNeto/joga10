import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Flag,
  Footprints,
  Goal,
  Hand,
  Minus,
  Plus,
  Timer,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "../../api/client";
import type { MatchDetail, Player, Team } from "../../types";
import { useToast } from "../../components/Feedback";
import { Avatar, Badge, Button, Card, IconButton, Modal, Segmented, Select, cx } from "../../components/ui";
import { errorMessage, readableOn } from "../../lib/format";
import { parseUtc } from "../../lib/teams";

export interface LineupPlayer {
  id: number;
  name: string;
  position: string | null;
  photo_url: string | null;
  goals: number;
  assists: number;
  guest: boolean; // lent from another team for this match
}

/** Current roster of the team plus players credited to it in this match. */
export function lineupOf(match: MatchDetail, teamId: number, teams: Team[], players: Player[]): LineupPlayer[] {
  const roster = teams.find((t) => t.id === teamId)?.players ?? [];
  const stats = new Map(match.stats.filter((s) => s.team_id === teamId).map((s) => [s.player_id, s]));
  const byId = new Map(players.map((p) => [p.id, p]));
  const rosterIds = new Set(roster.map((p) => p.id));
  const guests = [...stats.keys()]
    .filter((id) => !rosterIds.has(id))
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p);
  return [
    ...roster.map((p) => ({ ...p, guest: false })),
    ...guests.map((p) => ({ id: p.id, name: p.name, position: p.position, photo_url: p.photo_url, guest: true })),
  ].map((p) => ({ ...p, goals: stats.get(p.id)?.goals ?? 0, assists: stats.get(p.id)?.assists ?? 0 }));
}

function useElapsed(since: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - parseUtc(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Mode = "goals" | "manual";

export function CurrentMatch({
  match,
  teams,
  players,
  canRecord,
  number,
  onChange,
  onFinish,
  onCancel,
}: {
  match: MatchDetail;
  teams: Team[];
  players: Player[];
  canRecord: boolean;
  number: number;
  onChange: (match: MatchDetail) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("goals");
  const [scoring, setScoring] = useState<{ player: LineupPlayer; teamId: number } | null>(null);
  const [lending, setLending] = useState<number | null>(null); // team receiving a reinforcement
  const elapsed = useElapsed(match.created_at);
  const base = `/events/${match.event_id}/matches/${match.id}`;

  const sides = useMemo(
    () =>
      (["a", "b"] as const).map((side) => {
        const ref = side === "a" ? match.team_a : match.team_b;
        const team = teams.find((t) => t.id === ref.id);
        return {
          side,
          ref,
          team,
          score: side === "a" ? match.score_a : match.score_b,
          lineup: lineupOf(match, ref.id, teams, players),
        };
      }),
    [match, teams, players]
  );

  async function adjust(teamId: number, playerId: number, goals: number, assists: number) {
    try {
      onChange(await api.post<MatchDetail>(`${base}/stats`, { team_id: teamId, player_id: playerId, goals, assists }));
    } catch (err) {
      toast(errorMessage(err, "Falha ao registrar"), { tone: "error" });
    }
  }

  async function registerGoal(teamId: number, scorer: LineupPlayer, assist: LineupPlayer | null) {
    setScoring(null);
    try {
      onChange(
        await api.post<MatchDetail>(`${base}/goals`, {
          team_id: teamId,
          scorer_id: scorer.id,
          assist_id: assist?.id ?? null,
        })
      );
      toast(
        <span>
          Gol de <strong>{scorer.name}</strong>
          {assist ? ` (assist. ${assist.name})` : ""}
        </span>,
        {
          action: {
            label: "Desfazer",
            onClick: async () => {
              await adjust(teamId, scorer.id, -1, 0);
              if (assist) await adjust(teamId, assist.id, 0, -1);
            },
          },
        }
      );
    } catch (err) {
      toast(errorMessage(err, "Falha ao registrar o gol"), { tone: "error" });
    }
  }

  async function removeGuest(teamId: number, playerId: number) {
    try {
      onChange(await api.del<MatchDetail>(`${base}/stats/${playerId}?team_id=${teamId}`));
    } catch (err) {
      toast(errorMessage(err, "Falha ao remover"), { tone: "error" });
    }
  }

  const lineupIds = new Set(sides.flatMap((s) => s.lineup.map((p) => p.id)));

  return (
    <Card className="overflow-hidden">
      {/* scoreboard */}
      <div className="relative border-b border-line bg-gradient-to-b from-surface-2/70 to-surface px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Partida {number} · ao vivo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold tabular text-muted">
            <Timer size={13} /> {elapsed}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          {sides.map((s, i) => (
            <div key={s.side} className={cx("flex min-w-0 items-center gap-3", i === 0 ? "justify-end text-right" : "order-3 justify-start")}>
              <div className={cx("min-w-0", i === 0 ? "order-1" : "order-2")}>
                <p className="truncate text-sm font-bold text-fg sm:text-lg">{s.ref.name}</p>
                {s.team && s.team.stats.streak > 0 && (
                  <p className="text-[11px] text-subtle">{s.team.stats.streak} vitória(s) seguida(s)</p>
                )}
              </div>
              <span
                className={cx("h-10 w-2 shrink-0 rounded-full sm:h-12", i === 0 ? "order-2" : "order-1")}
                style={{ backgroundColor: s.ref.color || "#dc2626" }}
              />
            </div>
          ))}
          <div className="order-2 flex items-center gap-2 text-4xl font-black tabular text-fg sm:text-6xl">
            <span>{match.score_a}</span>
            <span className="text-2xl text-subtle sm:text-4xl">×</span>
            <span>{match.score_b}</span>
          </div>
        </div>
      </div>

      {canRecord && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "goals", label: "Registrar gols", icon: Goal },
              { value: "manual", label: "Manual", icon: Hand },
            ]}
          />
          <p className="text-xs text-subtle">
            {mode === "goals"
              ? "Toque no jogador que fez o gol e escolha quem deu a assistência."
              : "Ajuste gols e assistências com + e −."}
          </p>
        </div>
      )}

      {/* lineups */}
      <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
        {sides.map((s) => (
          <div key={s.side} className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.ref.color || "#dc2626" }} />
                {s.ref.name}
              </span>
              {canRecord && (
                <Button size="sm" variant="ghost" icon={UserPlus} onClick={() => setLending(s.ref.id)}>
                  Reforço
                </Button>
              )}
            </div>
            <ul className="space-y-1">
              {s.lineup.map((p) => (
                <li key={p.id}>
                  <PlayerRow
                    player={p}
                    mode={canRecord ? mode : null}
                    onScore={() => setScoring({ player: p, teamId: s.ref.id })}
                    onAdjust={(g, a) => adjust(s.ref.id, p.id, g, a)}
                    onRemove={p.guest && !p.goals && !p.assists ? () => removeGuest(s.ref.id, p.id) : undefined}
                  />
                </li>
              ))}
              {!s.lineup.length && <li className="px-2 py-4 text-center text-sm text-subtle">Time sem jogadores</li>}
            </ul>
          </div>
        ))}
      </div>

      {canRecord && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-6">
          <Button variant="ghost" icon={Ban} onClick={onCancel}>
            Cancelar partida
          </Button>
          <Button size="lg" icon={Flag} onClick={onFinish}>
            Finalizar partida
          </Button>
        </div>
      )}

      {scoring && (
        <GoalModal
          scorer={scoring.player}
          team={sides.find((s) => s.ref.id === scoring.teamId)!}
          onClose={() => setScoring(null)}
          onConfirm={(assist) => registerGoal(scoring.teamId, scoring.player, assist)}
        />
      )}
      {lending !== null && (
        <ReinforcementModal
          teamName={sides.find((s) => s.ref.id === lending)?.ref.name ?? ""}
          teams={teams}
          players={players}
          exclude={lineupIds}
          onClose={() => setLending(null)}
          onPick={async (playerId) => {
            const teamId = lending;
            setLending(null);
            await adjust(teamId, playerId, 0, 0);
          }}
        />
      )}
    </Card>
  );
}

function PlayerRow({
  player,
  mode,
  onScore,
  onAdjust,
  onRemove,
}: {
  player: LineupPlayer;
  mode: Mode | null;
  onScore: () => void;
  onAdjust: (goals: number, assists: number) => void;
  onRemove?: () => void;
}) {
  const counters = (
    <span className="flex shrink-0 items-center gap-1.5">
      {player.goals > 0 && (
        <Badge tone="green" icon={Goal}>
          {player.goals}
        </Badge>
      )}
      {player.assists > 0 && (
        <Badge tone="blue" icon={Footprints}>
          {player.assists}
        </Badge>
      )}
    </span>
  );
  const identity = (
    <>
      <Avatar name={player.name} src={player.photo_url} size={34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-fg">{player.name}</span>
          {player.guest && <Badge tone="violet">reforço</Badge>}
        </span>
        {player.position && <span className="block truncate text-[11px] text-subtle">{player.position}</span>}
      </span>
    </>
  );

  if (mode === "goals")
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onScore}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/10 active:scale-[0.99]"
        >
          {identity}
          {counters}
          <Goal size={16} className="shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-emerald-500" />
        </button>
        {onRemove && <IconButton icon={X} label="Remover reforço" size="sm" onClick={onRemove} />}
      </div>
    );

  if (mode === "manual")
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2/50">
        {identity}
        <Stepper label="Gols" icon={Goal} value={player.goals} onChange={(d) => onAdjust(d, 0)} />
        <Stepper label="Assist." icon={Footprints} value={player.assists} onChange={(d) => onAdjust(0, d)} />
        {onRemove && <IconButton icon={X} label="Remover reforço" size="sm" onClick={onRemove} />}
      </div>
    );

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
      {identity}
      {counters}
    </div>
  );
}

function Stepper({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  icon: typeof Goal;
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon size={14} className="text-subtle" />
      <IconButton icon={Minus} label={`- ${label}`} size="sm" variant="secondary" className="h-7 w-7" disabled={value <= 0} onClick={() => onChange(-1)} />
      <span className="w-6 text-center text-sm font-bold tabular text-fg">{value}</span>
      <IconButton icon={Plus} label={`+ ${label}`} size="sm" variant="secondary" className="h-7 w-7" onClick={() => onChange(1)} />
    </span>
  );
}

function GoalModal({
  scorer,
  team,
  onClose,
  onConfirm,
}: {
  scorer: LineupPlayer;
  team: { ref: { name: string; color: string | null }; lineup: LineupPlayer[] };
  onClose: () => void;
  onConfirm: (assist: LineupPlayer | null) => void;
}) {
  const mates = team.lineup.filter((p) => p.id !== scorer.id);
  const color = team.ref.color || "#dc2626";
  return (
    <Modal
      open
      onClose={onClose}
      title={`Gol de ${scorer.name}?`}
      description={`Para o ${team.ref.name}. Quem deu a assistência?`}
      icon={Goal}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => onConfirm(null)}>
            Sem assistência
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
        <Avatar name={scorer.name} src={scorer.photo_url} size={44} ring={color} />
        <div>
          <p className="font-semibold text-fg">{scorer.name}</p>
          <p className="text-xs text-subtle">autor do gol</p>
        </div>
        <span className="ml-auto rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: color, color: readableOn(color) }}>
          {team.ref.name}
        </span>
      </div>
      {mates.length ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {mates.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onConfirm(p)}
              className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-left transition-colors hover:border-sky-500/40 hover:bg-sky-500/10"
            >
              <Avatar name={p.name} src={p.photo_url} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
              <Footprints size={15} className="text-subtle" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Nenhum companheiro de time para dar a assistência.</p>
      )}
    </Modal>
  );
}

function ReinforcementModal({
  teamName,
  teams,
  players,
  exclude,
  onClose,
  onPick,
}: {
  teamName: string;
  teams: Team[];
  players: Player[];
  exclude: Set<number>;
  onClose: () => void;
  onPick: (playerId: number) => void;
}) {
  const [value, setValue] = useState("");
  const inTeam = new Map<number, Team>();
  teams.forEach((t) => t.players.forEach((p) => inTeam.set(p.id, t)));
  const options = players
    .filter((p) => !exclude.has(p.id))
    .sort((a, b) => (inTeam.get(a.id)?.id ?? 1e9) - (inTeam.get(b.id)?.id ?? 1e9) || a.name.localeCompare(b.name, "pt"));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reforço para o ${teamName}`}
      description="Um jogador de outro time (ou sem time) que vai jogar esta partida por este time. Os gols dele contam para este lado do placar."
      icon={UserPlus}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!value} onClick={() => onPick(Number(value))}>
            Adicionar
          </Button>
        </>
      }
    >
      <Select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
        <option value="">Escolha o jogador...</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {inTeam.get(p.id) ? `— ${inTeam.get(p.id)!.name}` : "— sem time"}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
