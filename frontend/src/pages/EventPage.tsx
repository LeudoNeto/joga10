import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChartColumn, Shirt, Swords } from "lucide-react";
import { api } from "../api/client";
import type { EventItem, GroupDetail, Player, Team } from "../types";
import { Alert, RoleBadge, Spinner, Tabs } from "../components/ui";
import { errorMessage, formatDate, isStaff } from "../lib/format";
import { TeamsTab } from "./event/TeamsTab";
import { MatchesTab } from "./event/MatchesTab";
import { StatsTab } from "./event/StatsTab";

export interface EventCtx {
  event: EventItem;
  setEvent: (event: EventItem) => void;
  group: GroupDetail;
  players: Player[];
  reloadPlayers: () => Promise<void>;
  teams: Team[];
  setTeams: (teams: Team[]) => void;
  reloadTeams: () => Promise<void>;
  isAdmin: boolean;
  isStaff: boolean; // admin or moderator
}

type TabKey = "teams" | "matches" | "stats";

export function EventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const id = Number(eventId);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) || "teams";

  const [event, setEvent] = useState<EventItem | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reloadTeams = useCallback(async () => {
    setTeams(await api.get<Team[]>(`/events/${id}/teams`));
  }, [id]);

  const reloadPlayers = useCallback(async () => {
    if (event) setPlayers(await api.get<Player[]>(`/groups/${event.group_id}/players`));
  }, [event]);

  useEffect(() => {
    (async () => {
      try {
        const ev = await api.get<EventItem>(`/events/${id}`);
        const [g, ps, ts] = await Promise.all([
          api.get<GroupDetail>(`/groups/${ev.group_id}`),
          api.get<Player[]>(`/groups/${ev.group_id}/players`),
          api.get<Team[]>(`/events/${id}/teams`),
        ]);
        setEvent(ev);
        setGroup(g);
        setPlayers(ps);
        setTeams(ts);
      } catch (err) {
        setError(errorMessage(err, "Falha ao carregar evento"));
      }
    })();
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!event || !group) return <Spinner label="Carregando evento..." />;

  const ctx: EventCtx = {
    event,
    setEvent,
    group,
    players,
    reloadPlayers,
    teams,
    setTeams,
    reloadTeams,
    isAdmin: group.role === "admin",
    isStaff: isStaff(group.role),
  };

  return (
    <div className="space-y-6">
      <Link to={`/groups/${group.id}?tab=events`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} /> {group.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{event.title}</h1>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted">
            <CalendarDays size={15} /> {formatDate(event.date)}
          </p>
        </div>
        <RoleBadge role={group.role} />
      </div>

      <Tabs
        value={tab}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
        tabs={[
          { key: "teams", label: "Times", icon: Shirt, count: teams.length || undefined },
          { key: "matches", label: "Partidas", icon: Swords },
          { key: "stats", label: "Estatísticas", icon: ChartColumn },
        ]}
      />

      {tab === "teams" && <TeamsTab ctx={ctx} />}
      {tab === "matches" && <MatchesTab ctx={ctx} />}
      {tab === "stats" && <StatsTab ctx={ctx} />}
    </div>
  );
}
