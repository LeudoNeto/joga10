import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightLeft, History, Play, Repeat, RotateCcw, Swords, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import type { EventItem, Match, MatchDetail, NextMatchSuggestion } from "../../types";
import { useConfirm, useToast } from "../../components/Feedback";
import { Alert, Badge, Button, Card, EmptyState, IconButton, SectionTitle, Select, Spinner, cx } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { parseUtc } from "../../lib/teams";
import type { EventCtx } from "../EventPage";
import { CurrentMatch } from "./CurrentMatch";
import { ChooseTeamsModal, FinishMatchModal } from "./FinishMatchModal";

const POLL_MS = 10_000;

export function MatchesTab({ ctx }: { ctx: EventCtx }) {
  const { event, teams, players, isAdmin, isStaff } = ctx;
  const confirm = useConfirm();
  const toast = useToast();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [current, setCurrent] = useState<MatchDetail | null>(null);
  const [suggestion, setSuggestion] = useState<NextMatchSuggestion | null>(null);
  const [finishing, setFinishing] = useState<MatchDetail | null>(null); // kept until the modal closes
  const [choosing, setChoosing] = useState<{ suggestion: NextMatchSuggestion | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const mutations = useRef(0); // ignore polls that started before a local change

  const base = `/events/${event.id}/matches`;

  const load = useCallback(async () => {
    const stamp = mutations.current;
    const [list, cur] = await Promise.all([api.get<Match[]>(base), api.get<MatchDetail | null>(`${base}/current`)]);
    const sug = cur ? null : await api.get<NextMatchSuggestion | null>(`${base}/suggestion`);
    if (stamp !== mutations.current) return;
    setMatches(list);
    setCurrent(cur);
    setSuggestion(sug);
  }, [base]);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err, "Falha ao carregar as partidas")));
  }, [load]);

  // live updates for everyone watching (e.g. members following the score)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !finishing) load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, finishing]);

  const changed = (m: MatchDetail) => {
    mutations.current++;
    setCurrent(m);
  };

  async function start(teamA?: number, teamB?: number) {
    mutations.current++;
    const m = await api.post<MatchDetail>(base, teamA ? { team_a_id: teamA, team_b_id: teamB } : {});
    setCurrent(m);
    setSuggestion(null);
    setChoosing(null);
    setFinishing(null);
    await load();
  }

  async function startSuggested() {
    setStarting(true);
    try {
      await start();
    } catch (err) {
      toast(errorMessage(err, "Falha ao iniciar a partida"), { tone: "error" });
    } finally {
      setStarting(false);
    }
  }

  async function cancelCurrent() {
    if (!current) return;
    const ok = await confirm({
      title: "Cancelar a partida atual?",
      message: "A partida e os gols e assistências registrados nela serão apagados.",
      confirmLabel: "Cancelar partida",
      danger: true,
    });
    if (!ok) return;
    mutations.current++;
    try {
      await api.del(`${base}/${current.id}`);
      setCurrent(null);
      await load();
      await ctx.reloadTeams();
    } catch (err) {
      toast(errorMessage(err, "Falha ao cancelar"), { tone: "error" });
    }
  }

  async function reopen(match: Match) {
    const ok = await confirm({
      title: "Reabrir a última partida?",
      message: "Ela volta a ficar em andamento para corrigir gols e assistências.",
      confirmLabel: "Reabrir",
    });
    if (!ok) return;
    mutations.current++;
    try {
      setCurrent(await api.post<MatchDetail>(`${base}/${match.id}/reopen`));
      await load();
      await ctx.reloadTeams();
    } catch (err) {
      toast(errorMessage(err, "Falha ao reabrir"), { tone: "error" });
    }
  }

  async function remove(match: Match) {
    const ok = await confirm({
      title: "Excluir esta partida do histórico?",
      message: "O placar e os gols e assistências dela serão apagados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    mutations.current++;
    try {
      await api.del(`${base}/${match.id}`);
      await load();
      await ctx.reloadTeams();
    } catch (err) {
      toast(errorMessage(err, "Falha ao excluir"), { tone: "error" });
    }
  }

  if (matches === null) return error ? <Alert>{error}</Alert> : <Spinner label="Carregando partidas..." />;

  const finished = matches.filter((m) => m.status === "finished");
  const numberOf = new Map(matches.map((m, i) => [m.id, i + 1]));
  const latest = matches[matches.length - 1];
  const playable = teams.filter((t) => t.players.length > 0);
  const team = (id: number) => teams.find((t) => t.id === id);

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <RotationRule event={event} canEdit={isAdmin} onSaved={ctx.setEvent} />

      {current ? (
        <CurrentMatch
          match={current}
          teams={teams}
          players={players}
          canRecord={isStaff}
          number={numberOf.get(current.id) ?? matches.length}
          onChange={changed}
          onFinish={() => setFinishing(current)}
          onCancel={cancelCurrent}
        />
      ) : playable.length < 2 ? (
        <EmptyState
          icon={Swords}
          title="Ainda não há times para jogar"
          description="Sorteie os times na aba Times para começar as partidas."
        />
      ) : (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            icon={Play}
            title={finished.length ? "Próxima partida" : "Primeira partida"}
            description={suggestion?.reason}
          />
          {suggestion && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-lg font-bold text-fg">
              <TeamName team={team(suggestion.team_a_id)} />
              <span className="text-subtle">×</span>
              <TeamName team={team(suggestion.team_b_id)} />
            </div>
          )}
          {isStaff ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={Play} onClick={startSuggested} loading={starting} disabled={!suggestion}>
                Iniciar partida
              </Button>
              <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setChoosing({ suggestion })}>
                Escolher times
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Aguardando um administrador ou moderador iniciar a partida.</p>
          )}
        </Card>
      )}

      <section className="space-y-3">
        <SectionTitle icon={History} title="Histórico" description={`${finished.length} partida(s) finalizada(s)`} />
        {finished.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-subtle">
            As partidas finalizadas aparecem aqui.
          </p>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {[...finished].reverse().map((m) => (
              <HistoryRow
                key={m.id}
                match={m}
                number={numberOf.get(m.id) ?? 0}
                canReopen={isStaff && !current && latest?.id === m.id}
                canDelete={isAdmin}
                onReopen={() => reopen(m)}
                onDelete={() => remove(m)}
              />
            ))}
          </Card>
        )}
      </section>

      {finishing && (
        <FinishMatchModal
          match={finishing}
          teams={teams}
          onClose={() => setFinishing(null)}
          onFinished={() => {
            mutations.current++;
            setCurrent(null);
            load().catch(() => {});
            ctx.reloadTeams();
          }}
          onStartNext={async () => {
            await start();
          }}
          onChooseNext={(s) => {
            setFinishing(null);
            setChoosing({ suggestion: s });
          }}
        />
      )}
      {choosing && (
        <ChooseTeamsModal
          teams={teams}
          suggestion={choosing.suggestion}
          onClose={() => setChoosing(null)}
          onStart={(a, b) => start(a, b)}
        />
      )}
    </div>
  );
}

function TeamName({ team }: { team?: { name: string; color: string | null } }) {
  if (!team) return <span className="text-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color || "#dc2626" }} />
      {team.name}
    </span>
  );
}

const STAY_LABEL = (m: Match) =>
  m.staying === "a"
    ? `${m.team_a.name} ficou`
    : m.staying === "b"
    ? `${m.team_b.name} ficou`
    : m.staying === "none"
    ? "os dois saíram"
    : m.staying === "both"
    ? "os dois seguiram"
    : "";

function HistoryRow({
  match: m,
  number,
  canReopen,
  canDelete,
  onReopen,
  onDelete,
}: {
  match: Match;
  number: number;
  canReopen: boolean;
  canDelete: boolean;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const winA = m.score_a > m.score_b;
  const winB = m.score_b > m.score_a;
  const side = (t: Match["team_a"], win: boolean, right?: boolean) => (
    <span
      className={cx("flex min-w-0 items-center gap-2", right && "flex-row-reverse text-right", !t.active && "opacity-60")}
      title={t.active ? undefined : "Formação anterior (times refeitos)"}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color || "#dc2626" }} />
      <span className={cx("truncate text-xs sm:text-sm", win ? "font-bold text-fg" : "text-muted")}>{t.name}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-7 shrink-0 text-xs font-bold tabular text-subtle">#{number}</span>
      <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
        {side(m.team_a, winA, true)}
        <span className="rounded-lg bg-surface-2 px-2.5 py-0.5 text-sm font-bold tabular text-fg">
          {m.score_a} × {m.score_b}
        </span>
        {side(m.team_b, winB)}
      </div>
      <span className="hidden w-48 shrink-0 truncate text-xs text-subtle md:block" title={STAY_LABEL(m)}>
        {m.played_at && parseUtc(m.played_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        {m.staying && ` · ${STAY_LABEL(m)}`}
      </span>
      {(canReopen || canDelete) && (
        <div className="flex shrink-0 gap-0.5">
          {canReopen && <IconButton icon={RotateCcw} label="Reabrir partida" size="sm" onClick={onReopen} />}
          {canDelete && <IconButton icon={Trash2} label="Excluir partida" size="sm" onClick={onDelete} />}
        </div>
      )}
    </div>
  );
}

function RotationRule({
  event,
  canEdit,
  onSaved,
}: {
  event: EventItem;
  canEdit: boolean;
  onSaved: (event: EventItem) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = event.wins_to_leave;
  const text = n
    ? `Quem perde sai. Quem vencer ${n} partida(s) seguida(s) sai junto com o perdedor (com só 3 times, o perdedor fica).`
    : "Quem perde sai e o vencedor fica, sem limite de vitórias seguidas.";

  async function change(value: number) {
    setBusy(true);
    try {
      onSaved(await api.patch<EventItem>(`/events/${event.id}`, { wins_to_leave: value }));
      toast("Regra de rodízio atualizada");
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <Repeat size={16} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            Rodízio de times
            <Badge tone="brand">{n ? `sai com ${n} vitória(s) seguida(s)` : "sem limite"}</Badge>
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {text} A próxima partida traz o time há mais tempo sem jogar.
          </p>
        </div>
      </div>
      {canEdit && (
        <div className="w-full sm:w-64">
          <Select value={n} disabled={busy} onChange={(e) => change(Number(e.target.value))} aria-label="Vitórias seguidas para sair">
            <option value={0}>Sem limite de vitórias</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((v) => (
              <option key={v} value={v}>
                {v > 1 ? `Sai com ${v} vitórias seguidas` : "Sai com 1 vitória"}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Card>
  );
}
