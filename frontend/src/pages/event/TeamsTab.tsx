import { useCallback, useMemo, useState } from "react";
import { Info, PencilRuler, Plus, Shirt, TriangleAlert } from "lucide-react";
import { api } from "../../api/client";
import type { Team } from "../../types";
import { useConfirm, useToast } from "../../components/Feedback";
import { ExportPanel } from "../../components/ExportPanel";
import { Badge, Button, Checkbox, EmptyState } from "../../components/ui";
import { MODE_LABELS, spreadCents, substitutesFor } from "../../lib/draw";
import { drawTeamsImage, type ImageTheme } from "../../lib/exportImage";
import { teamsText } from "../../lib/exportText";
import { errorMessage, fmtDec } from "../../lib/format";
import { MAX_TEAMS } from "../../lib/teams";
import type { EventCtx } from "../EventPage";
import { DrawPanel } from "./DrawPanel";
import { TeamCard } from "./TeamCard";

export function TeamsTab({ ctx }: { ctx: EventCtx }) {
  const { event, teams, players, isAdmin } = ctx;
  const confirm = useConfirm();
  const toast = useToast();
  const [editMode, setEditMode] = useState(false);
  const [showSkills, setShowSkills] = useState(true);

  const subs = useMemo(
    () => substitutesFor(teams.map((t) => t.players), event.use_substitutes),
    [teams, event.use_substitutes]
  );
  const spread = spreadCents(teams.map((t) => t.players), subs);
  const algorithm = event.draw_mode ? MODE_LABELS[event.draw_mode] : null;

  const inTeam = useMemo(() => new Set(teams.flatMap((t) => t.players.map((p) => p.id))), [teams]);
  const available = useMemo(
    () => players.filter((p) => !inTeam.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "pt")),
    [players, inTeam]
  );

  async function run(action: () => Promise<Team[]>, success?: string) {
    try {
      ctx.setTeams(await action());
      if (success) toast(success);
    } catch (err) {
      toast(errorMessage(err, "Falha ao alterar os times"), { tone: "error" });
    }
  }

  async function removeTeam(team: Team) {
    const ok = await confirm({
      title: `Remover ${team.name}?`,
      message: team.stats.played
        ? "O time sai do evento, mas as partidas que ele jogou continuam no histórico."
        : "Os jogadores do time ficarão sem time.",
      confirmLabel: "Remover time",
      danger: true,
    });
    if (ok) run(() => api.del<Team[]>(`/events/${event.id}/teams/${team.id}`), `${team.name} removido`);
  }

  const exportData = useMemo(
    () => ({
      event,
      teams: teams.map((t, j) => ({ name: t.name, color: t.color, players: t.players, substitutes: subs[j] })),
      algorithm,
      proven: event.draw_proven,
      spreadCents: spread,
      showSkills,
    }),
    [event, teams, subs, algorithm, spread, showSkills]
  );
  const getText = useCallback(() => teamsText(exportData), [exportData]);
  const renderImage = useCallback(
    (canvas: HTMLCanvasElement, theme: ImageTheme) => drawTeamsImage(canvas, exportData, theme),
    [exportData]
  );

  return (
    <div className="space-y-6">
      {isAdmin && <DrawPanel key={event.id} ctx={ctx} />}

      {teams.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title="Times ainda não sorteados"
          description={isAdmin ? "Escolha o modo de balanceamento acima para formar os times." : "Aguarde um administrador sortear os times."}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {algorithm && <Badge tone="brand">Algoritmo: {algorithm}</Badge>}
              <Badge>Diferença entre times: {fmtDec(spread / 100)}</Badge>
              {event.use_substitutes && subs.some((s) => s.length) && (
                <span className="inline-flex items-center gap-1 text-xs text-subtle" title="Suplente: nota que o jogador ausente precisaria ter para os times ficarem parelhos">
                  <Info size={13} /> com suplentes
                </span>
              )}
              {!event.draw_proven && event.draw_mode === "optimal" && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert size={13} /> otimalidade não provada no tempo limite
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                {editMode && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Plus}
                    disabled={teams.length >= MAX_TEAMS}
                    onClick={() => run(() => api.post<Team[]>(`/events/${event.id}/teams`, {}), "Time adicionado")}
                  >
                    Novo time
                  </Button>
                )}
                <Button size="sm" variant={editMode ? "primary" : "secondary"} icon={PencilRuler} onClick={() => setEditMode((e) => !e)}>
                  {editMode ? "Concluir edição" : "Editar times"}
                </Button>
              </div>
            )}
          </div>

          {editMode && (
            <p className="text-xs text-subtle">
              Mova jogadores entre times, adicione quem chegou ou tire quem saiu. O histórico de partidas e as
              estatísticas dos jogadores são mantidos.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team, j) => (
              <TeamCard
                key={team.id}
                team={team}
                substitutes={subs[j]}
                editMode={editMode}
                otherTeams={teams.filter((t) => t.id !== team.id)}
                available={available}
                onMove={(pid, to) => run(() => api.put<Team[]>(`/events/${event.id}/teams/${to.id}/players/${pid}`))}
                onRemovePlayer={(pid) => run(() => api.del<Team[]>(`/events/${event.id}/teams/${team.id}/players/${pid}`))}
                onAddPlayer={(pid) => run(() => api.put<Team[]>(`/events/${event.id}/teams/${team.id}/players/${pid}`))}
                onRemoveTeam={() => removeTeam(team)}
              />
            ))}
          </div>

          <ExportPanel
            title="Exportar times"
            filename="times"
            getText={getText}
            renderImage={renderImage}
            options={<Checkbox checked={showSkills} onChange={(e) => setShowSkills(e.target.checked)} label="Incluir notas" />}
          />
        </>
      )}
    </div>
  );
}
