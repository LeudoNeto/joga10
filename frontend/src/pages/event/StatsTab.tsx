import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChartColumn, Footprints, Goal, Info, Pencil, RefreshCw, Trophy } from "lucide-react";
import { api } from "../../api/client";
import type { Player, RankingRow } from "../../types";
import { useToast } from "../../components/Feedback";
import { ExportPanel } from "../../components/ExportPanel";
import { PhotoPicker, PositionInput, savePhoto, type PhotoChange } from "../../components/PlayerFields";
import { Alert, Avatar, Button, Card, EmptyState, Field, IconButton, Modal, Spinner, cx } from "../../components/ui";
import { drawRankingImage, type ImageTheme } from "../../lib/exportImage";
import { RANKING_FORMULA, rankingText } from "../../lib/exportText";
import { errorMessage } from "../../lib/format";
import type { EventCtx } from "../EventPage";

const PODIUM = [
  { ring: "#eab308", label: "1º", tint: "from-amber-500/15" },
  { ring: "#a1a1aa", label: "2º", tint: "from-zinc-400/15" },
  { ring: "#c2410c", label: "3º", tint: "from-orange-700/15" },
];

export function StatsTab({ ctx }: { ctx: EventCtx }) {
  const { event, isStaff, players } = ctx;
  const toast = useToast();
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<RankingRow[]>(`/events/${event.id}/stats`));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar as estatísticas"));
    }
  }, [event.id]);

  useEffect(() => {
    load();
  }, [load]);

  const getText = useCallback(() => rankingText(event, rows ?? []), [event, rows]);
  const renderImage = useCallback(
    (canvas: HTMLCanvasElement, theme: ImageTheme) => drawRankingImage(canvas, event, rows ?? [], theme),
    [event, rows]
  );
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  if (rows === null) return error ? <Alert>{error}</Alert> : <Spinner label="Carregando estatísticas..." />;

  const podium = rows.filter((r) => r.points > 0).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-start gap-1.5 text-xs text-subtle">
          <Info size={14} className="mt-px shrink-0" /> {RANKING_FORMULA}
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        >
          Atualizar
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="Sem estatísticas ainda"
          description="O ranking aparece quando houver times sorteados e gols ou assistências registrados nas partidas."
        />
      ) : (
        <>
          {podium.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {podium.map((r, i) => (
                <Card key={r.player_id} className={cx("relative overflow-hidden bg-gradient-to-b to-transparent p-4", PODIUM[i].tint)}>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} src={r.photo_url} size={52} ring={PODIUM[i].ring} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: PODIUM[i].ring }}>
                        <Trophy size={13} /> {r.rank}º lugar
                      </p>
                      <p className="truncate text-base font-bold text-fg">{r.name}</p>
                      <p className="truncate text-xs text-subtle">{r.position || "Sem posição"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black tabular leading-none text-fg">{r.score}</p>
                      <p className="text-[11px] text-subtle">pontos</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Goal size={13} /> {r.goals} gol(s)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Footprints size={13} /> {r.assists} assist.
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="w-10 px-3 py-2.5 sm:w-12 sm:px-4">#</th>
                    <th className="px-2 py-2.5">Jogador</th>
                    <th className="hidden px-2 py-2.5 sm:table-cell">Time</th>
                    <th className="w-9 px-1 py-2.5 text-center sm:w-12 sm:px-2" title="Gols">G</th>
                    <th className="w-9 px-1 py-2.5 text-center sm:w-12 sm:px-2" title="Assistências">A</th>
                    <th className="w-14 px-3 py-2.5 text-right sm:w-48 sm:px-4 sm:text-left">Pontos</th>
                    {isStaff && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const player = byId.get(r.player_id);
                    return (
                      <tr key={r.player_id} className="transition-colors hover:bg-surface-2/40">
                        <td className="px-3 py-2.5 sm:px-4">
                          <span
                            className={cx(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular",
                              r.rank <= 3 && r.points > 0 ? "text-white" : "bg-surface-2 text-muted"
                            )}
                            style={r.rank <= 3 && r.points > 0 ? { backgroundColor: PODIUM[r.rank - 1].ring } : undefined}
                          >
                            {r.rank}
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={r.name} src={r.photo_url} size={34} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-fg">{r.name}</p>
                              <p className="flex items-center gap-1.5 truncate text-xs text-subtle">
                                {r.team_color && (
                                  <span className="h-2 w-2 shrink-0 rounded-full sm:hidden" style={{ backgroundColor: r.team_color }} />
                                )}
                                {r.position || "Sem posição"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-2 py-2.5 sm:table-cell">
                          {r.team_name ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.team_color || "#dc2626" }} />
                              {r.team_name}
                            </span>
                          ) : (
                            <span className="text-xs text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-1 py-2.5 text-center font-bold tabular text-fg sm:px-2">{r.goals}</td>
                        <td className="px-1 py-2.5 text-center font-bold tabular text-fg sm:px-2">{r.assists}</td>
                        <td className="px-3 py-2.5 sm:px-4">
                          <div className="flex items-center justify-end gap-2.5 sm:justify-start">
                            <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block">
                              <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-500" style={{ width: `${r.score}%` }} />
                            </div>
                            <span className="w-8 text-right font-bold tabular text-fg">{r.score}</span>
                          </div>
                        </td>
                        {isStaff && (
                          <td className="pr-3">
                            {player && (
                              <IconButton icon={Pencil} label={`Editar foto e posição de ${r.name}`} size="sm" onClick={() => setEditing(player)} />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <ExportPanel title="Exportar ranking" filename="ranking" getText={getText} renderImage={renderImage} />
        </>
      )}

      {editing && (
        <EditPlayerModal
          ctx={ctx}
          player={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast("Jogador atualizado");
            await Promise.all([load(), ctx.reloadPlayers(), ctx.reloadTeams()]);
          }}
        />
      )}
    </div>
  );
}

/** Photo + position: what moderators may change (admins too). */
function EditPlayerModal({
  ctx,
  player,
  onClose,
  onSaved,
}: {
  ctx: EventCtx;
  player: Player;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [position, setPosition] = useState(player.position ?? "");
  const [photo, setPhoto] = useState<PhotoChange>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if ((position.trim() || null) !== (player.position || null)) {
        await api.put(`/groups/${ctx.group.id}/players/${player.id}`, { position: position.trim() || null });
      }
      await savePhoto(ctx.group.id, player.id, photo);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar"));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={player.name} description="Foto e posição do jogador" icon={Pencil} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <PhotoPicker name={player.name} currentUrl={player.photo_url} value={photo} onChange={setPhoto} onError={setError} />
        <Field label="Posição" hint="Gols de meio-campistas, defensores e goleiros valem mais no ranking.">
          <PositionInput value={position} onChange={setPosition} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
