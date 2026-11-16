import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChartColumn, ChartPie, ChevronLeft, Shirt, UserRound } from "lucide-react";
import { api } from "../api/client";
import { Alert, EmptyState, Spinner, Tabs } from "../components/ui";
import { errorMessage, fmtSkill, plural } from "../lib/format";
import { indexStats, type StatsIndex } from "../lib/voteStats";
import type { GroupDetail, VoteStats } from "../types";
import { GeneralTab } from "./voteStats/GeneralTab";
import { PlayerTab } from "./voteStats/PlayerTab";
import { VoterTab } from "./voteStats/VoterTab";

type TabKey = "general" | "player" | "voter";
const TABS: TabKey[] = ["general", "player", "voter"];

/** Default player: the first active one with votes (else any active one). */
function defaultPlayer(idx: StatsIndex) {
  return (idx.active.find((p) => idx.byPlayer.has(p.id)) ?? idx.active[0] ?? idx.players[0])?.id ?? null;
}

function defaultVoter(idx: StatsIndex) {
  return (idx.electorate.find((v) => idx.byVoter.has(v.user_id)) ?? idx.electorate[0])?.user_id ?? null;
}

/** Voting statistics (admins only): overview, per player and per voter. */
export function VoteStatsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<VoteStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await api.get<GroupDetail>(`/groups/${id}`);
        if (!alive) return;
        setGroup(g);
        if (g.role === "admin") {
          const s = await api.get<VoteStats>(`/groups/${id}/votes/stats`);
          if (alive) setStats(s);
        }
      } catch (err) {
        if (alive) setError(errorMessage(err, "Falha ao carregar as estatísticas"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const idx = useMemo(() => (stats ? indexStats(stats) : null), [stats]);

  const raw = params.get("tab") as TabKey;
  const tab: TabKey = TABS.includes(raw) ? raw : "general";
  const wanted = Number(params.get("id")) || null;

  /** Switch tab (and selection). Drill-downs from another tab push history,
   * so the browser's back button returns to where the reader was. */
  function go(next: TabKey, selected?: number | null, push = false) {
    setParams(selected ? { tab: next, id: String(selected) } : { tab: next }, { replace: !push });
    if (push) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const back = (
    <Link to={`/groups/${id}?tab=players`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft size={16} /> {group?.name ?? "Grupo"}
    </Link>
  );

  if (error) return <Alert>{error}</Alert>;
  if (!group) return <Spinner label="Carregando estatísticas..." />;
  if (group.role !== "admin")
    return (
      <div className="space-y-6">
        {back}
        <Alert>Apenas administradores do grupo podem ver as estatísticas da votação.</Alert>
      </div>
    );
  if (!idx) return <Spinner label="Carregando estatísticas..." />;

  const playerId =
    wanted !== null && idx.playerById.has(wanted) && tab === "player" ? wanted : defaultPlayer(idx);
  const voterId =
    wanted !== null && tab === "voter" && idx.electorate.some((v) => v.user_id === wanted) ? wanted : defaultVoter(idx);
  const toPlayer = (playerId: number, push = tab !== "player") => go("player", playerId, push);
  const toVoter = (voterId: number, push = tab !== "voter") => go("voter", voterId, push);

  return (
    <div className="space-y-6">
      {back}

      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          <ChartColumn className="text-accent" /> Estatísticas de Votação
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Notas de {fmtSkill(idx.min)} a {fmtSkill(idx.max)} · {plural(idx.active.length, "jogador ativo", "jogadores ativos")}{" "}
          · {plural(idx.voters.length, "membro", "membros")}. Os votos individuais aparecem só para administradores.
        </p>
      </div>

      <Tabs
        value={tab}
        onChange={(t) => go(t)}
        tabs={[
          { key: "general", label: "Geral", icon: ChartPie },
          { key: "player", label: "Por Jogador", icon: Shirt },
          { key: "voter", label: "Por votante", icon: UserRound },
        ]}
      />

      {tab === "general" && <GeneralTab idx={idx} onPlayer={(p) => toPlayer(p, true)} onVoter={(v) => toVoter(v, true)} />}
      {tab === "player" &&
        (playerId === null ? (
          <EmptyState icon={Shirt} title="Nenhum jogador cadastrado" />
        ) : (
          <PlayerTab idx={idx} playerId={playerId} onPlayer={(p) => toPlayer(p)} onVoter={(v) => toVoter(v)} />
        ))}
      {tab === "voter" &&
        (voterId === null ? (
          <EmptyState
            icon={UserRound}
            title="Nenhum votante"
            description="Os membros entram aqui depois de escolher o próprio jogador."
          />
        ) : (
          <VoterTab idx={idx} voterId={voterId} onPlayer={(p) => toPlayer(p)} onVoter={(v) => toVoter(v)} />
        ))}
    </div>
  );
}
