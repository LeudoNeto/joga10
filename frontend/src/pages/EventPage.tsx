import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { EventItem, GroupDetail, Player, Team } from "../types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  Spinner,
} from "../components/ui";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const id = Number(eventId);

  const [event, setEvent] = useState<EventItem | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    setTeams(await api.get<Team[]>(`/events/${id}/teams`));
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const ev = await api.get<EventItem>(`/events/${id}`);
        setEvent(ev);
        setGroupId(ev.group_id);
        const group = await api.get<GroupDetail>(`/groups/${ev.group_id}`);
        setIsAdmin(group.role === "admin");
        setGroupName(group.name);
        setPlayers(await api.get<Player[]>(`/groups/${ev.group_id}/players`));
        await loadTeams();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Falha ao carregar evento");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadTeams]);

  const refreshAll = useCallback(async () => {
    await loadTeams();
  }, [loadTeams]);

  if (loading) return <Spinner label="Carregando evento..." />;
  if (error) return <Alert>{error}</Alert>;
  if (!event) return <Alert>Evento não encontrado</Alert>;

  return (
    <div className="space-y-6">
      {groupId && (
        <Link
          to={`/groups/${groupId}`}
          className="text-sm text-slate-500 hover:text-pitch-600"
        >
          ← {groupName || "Grupo"}
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-800">{event.title}</h1>
        <p className="text-sm text-slate-500">📅 {formatDate(event.date)}</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Times</h2>
          {teams.length > 0 && (
            <span className="text-sm text-slate-500">
              {teams.length} times formados
            </span>
          )}
        </div>

        {isAdmin && (
          <DrawControls
            eventId={id}
            players={players}
            hasTeams={teams.length > 0}
            onDrawn={refreshAll}
          />
        )}

        {teams.length === 0 ? (
          <EmptyState
            title="Times ainda não sorteados"
            description={
              isAdmin
                ? "Escolha o modo de sorteio acima para formar os times."
                : "Aguarde um administrador sortear os times."
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <TeamCard key={t.id} team={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TeamCard({ team }: { team: Team }) {
  const color = team.color || "#16a34a";
  const sorted = [...team.players].sort((a, b) => b.skill - a.skill);
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2 text-white"
        style={{ backgroundColor: color }}
      >
        <span className="font-semibold">{team.name}</span>
        <span className="text-xs opacity-90">
          {team.players.length} jog. · média {team.avg_skill.toFixed(1)}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {sorted.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="text-slate-700">{p.name}</span>
            <span className="font-medium text-slate-400">
              {p.skill.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-4 py-2 text-right text-xs text-slate-500">
        Força total: <span className="font-semibold">{team.total_skill.toFixed(1)}</span>
      </div>
    </Card>
  );
}

function DrawControls({
  eventId,
  players,
  hasTeams,
  onDrawn,
}: {
  eventId: number;
  players: Player[];
  hasTeams: boolean;
  onDrawn: () => void;
}) {
  const activePlayers = players.filter((p) => p.active);
  const [mode, setMode] = useState<"balanced" | "random">("balanced");
  const [numTeams, setNumTeams] = useState(2);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(activePlayers.map((p) => p.id))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);

  function toggle(pid: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  }

  async function draw() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${eventId}/draw`, {
        mode,
        num_teams: numTeams,
        player_ids: Array.from(selected),
      });
      onDrawn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao sortear times");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("Limpar os times e partidas deste evento?")) return;
    setBusy(true);
    try {
      await api.del(`/events/${eventId}/teams`);
      onDrawn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Modo de sorteio">
          <Select
            value={mode}
            onChange={(e) => setMode(e.target.value as "balanced" | "random")}
          >
            <option value="balanced">Balanceado (pelas notas)</option>
            <option value="random">100% Aleatório</option>
          </Select>
        </Field>
        <Field label="Quantidade de times">
          <Select
            value={numTeams}
            onChange={(e) => setNumTeams(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} times
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Jogadores selecionados">
          <button
            type="button"
            onClick={() => setShowPlayers((s) => !s)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
          >
            {selected.size} de {activePlayers.length} · {showPlayers ? "ocultar" : "ajustar"}
          </button>
        </Field>
      </div>

      {showPlayers && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex gap-3 text-xs">
            <button
              className="text-pitch-600 hover:underline"
              onClick={() => setSelected(new Set(activePlayers.map((p) => p.id)))}
            >
              Selecionar todos
            </button>
            <button
              className="text-slate-500 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Limpar seleção
            </button>
          </div>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {activePlayers.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-pitch-600"
                />
                <span className="truncate text-slate-700">{p.name}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {p.skill.toFixed(1)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={draw} disabled={busy || selected.size < numTeams}>
          {busy ? "Sorteando..." : hasTeams ? "Refazer sorteio" : "Sortear times"}
        </Button>
        {hasTeams && (
          <Button variant="secondary" onClick={clear} disabled={busy}>
            Limpar
          </Button>
        )}
        {selected.size < numTeams && (
          <span className="text-xs text-red-500">
            Selecione ao menos {numTeams} jogadores.
          </span>
        )}
        <Badge color="slate">
          {mode === "balanced" ? "RN04: notas balanceadas" : "Sorteio aleatório"}
        </Badge>
      </div>
    </Card>
  );
}
