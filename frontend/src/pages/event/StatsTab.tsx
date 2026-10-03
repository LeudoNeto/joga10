import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  Footprints,
  Goal,
  Info,
  LayoutGrid,
  List,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { api } from "../../api/client";
import type { Match, Player, RankingRow } from "../../types";
import { useToast } from "../../components/Feedback";
import { ExportPanel } from "../../components/ExportPanel";
import { PlayerCard } from "../../components/PlayerCard";
import { CardEditorModal } from "../../components/CardEditorModal";
import { CARD_TEMPLATES, POSITION_PRESETS } from "../../lib/cards";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  SectionTitle,
  Spinner,
  cx,
} from "../../components/ui";
import { drawRankingImage, type ImageTheme } from "../../lib/exportImage";
import { RANKING_FORMULA, rankingText } from "../../lib/exportText";
import { errorMessage } from "../../lib/format";
import type { EventCtx } from "../EventPage";

const PODIUM_CONFIG = [
  { ring: "#eab308", label: "1º Lugar — Campeão", icon: "🏆", bg: "from-amber-500/15 via-amber-500/5 to-transparent", border: "border-amber-500/40" },
  { ring: "#94a3b8", label: "2º Lugar — Vice", icon: "🥈", bg: "from-slate-400/15 via-slate-400/5 to-transparent", border: "border-slate-400/40" },
  { ring: "#ea580c", label: "3º Lugar", icon: "🥉", bg: "from-orange-600/15 via-orange-600/5 to-transparent", border: "border-orange-500/40" },
];

export function StatsTab({ ctx }: { ctx: EventCtx }) {
  const { event, isStaff, players } = ctx;
  const toast = useToast();
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [hasNoMatches, setHasNoMatches] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ player: Player; stat?: RankingRow } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [quickEdit, setQuickEdit] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [statsRes, matchesRes] = await Promise.all([
        api.get<RankingRow[]>(`/events/${event.id}/stats`),
        api.get<Match[]>(`/events/${event.id}/matches`),
      ]);
      setRows(statsRes);
      setHasNoMatches(matchesRes.length === 0);
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar as estatísticas"));
    }
  }, [event.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdjustStat = useCallback(
    async (playerId: number, deltaGoals: number, deltaAssists: number) => {
      const row = rows?.find((r) => r.player_id === playerId);
      if (!row) return;
      const nextGoals = Math.max(0, row.goals + deltaGoals);
      const nextAssists = Math.max(0, row.assists + deltaAssists);
      if (nextGoals === row.goals && nextAssists === row.assists) return;

      // Optimistic update
      setRows((prev) =>
        prev?.map((r) => (r.player_id === playerId ? { ...r, goals: nextGoals, assists: nextAssists } : r)) ?? null
      );

      try {
        setSavingPlayerId(playerId);
        await api.put(`/events/${event.id}/stats/${playerId}`, {
          goals: nextGoals,
          assists: nextAssists,
        });
        const updated = await api.get<RankingRow[]>(`/events/${event.id}/stats`);
        setRows(updated);
      } catch (err) {
        toast(errorMessage(err, "Falha ao salvar estatísticas"), { tone: "error" });
        await load();
      } finally {
        setSavingPlayerId(null);
      }
    },
    [event.id, load, rows, toast]
  );

  const getText = useCallback(() => rankingText(event, rows ?? []), [event, rows]);
  const renderImage = useCallback(
    (canvas: HTMLCanvasElement, theme: ImageTheme) => drawRankingImage(canvas, event, rows ?? [], theme),
    [event, rows]
  );
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  if (rows === null) return error ? <Alert>{error}</Alert> : <Spinner label="Carregando estatísticas..." />;

  const first = rows[0] || null;
  const secondAndThird = rows.slice(1, 3);
  const others = rows.slice(3);

  return (
    <div className="space-y-6">
      {/* Top action bar: Formula note, view toggle, refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-start gap-1.5 text-xs text-subtle">
          <Info size={14} className="mt-px shrink-0" /> {RANKING_FORMULA}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {hasNoMatches && isStaff && (
            <Button
              size="sm"
              variant={viewMode === "table" && quickEdit ? "primary" : "secondary"}
              icon={Zap}
              onClick={() => {
                if (viewMode === "cards") {
                  setViewMode("table");
                  setQuickEdit(true);
                } else {
                  setQuickEdit(!quickEdit);
                }
              }}
            >
              Edição Rápida
            </Button>
          )}

          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-line bg-surface-2 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors",
                viewMode === "cards" ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-fg"
              )}
            >
              <LayoutGrid size={14} /> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-colors",
                viewMode === "table" ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-fg"
              )}
            >
              <List size={14} /> Tabela
            </button>
          </div>

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
      </div>

      {hasNoMatches && (
        <Alert tone="info">
          Nenhuma partida foi registrada ainda para este evento.{" "}
          {isStaff
            ? "Como administrador/moderador, você pode definir as estatísticas dos jogadores clicando em 'Editar' nos cards."
            : "Você pode registrar suas estatísticas na aba 'Seu Card'."}
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="Sem jogadores no ranking ainda"
          description="O ranking exibe os cards oficiais quando houver jogadores ou partidas cadastradas no evento."
        />
      ) : (
        <>
          {/* CARDS VIEW (DEFAULT) */}
          {viewMode === "cards" && (
            <div className="space-y-8">
              {/* Podium 1st Place: MVP Spotlight */}
              {first && (
                <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent p-6 text-center shadow-2xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-500/20 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-amber-300">
                    <Trophy size={16} className="text-amber-400" /> 1º Lugar — MVP
                  </div>

                  <div className="mx-auto flex flex-col items-center">
                    <div className="w-full max-w-[280px]">
                      <PlayerCard
                        name={first.name}
                        position={first.position}
                        points={first.score}
                        goals={first.goals}
                        assists={first.assists}
                        imageUrl={first.photo_url}
                        templateId={first.card_template || "card-template"}
                        className="shadow-2xl ring-2 ring-amber-400/50 transition-transform hover:scale-[1.03]"
                      />
                    </div>

                    {isStaff && byId.get(first.player_id) && (
                      <div className="mt-4">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Pencil}
                          onClick={() => setEditing({ player: byId.get(first.player_id)!, stat: first })}
                        >
                          Editar Jogador / Estatísticas
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Podium 2nd & 3rd Place: 2 on PC, 1 on mobile, with colored background Card */}
              {secondAndThird.length > 0 && (
                <div
                  className={cx(
                    "grid gap-6",
                    secondAndThird.length === 1
                      ? "max-w-md mx-auto"
                      : "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
                  )}
                >
                  {secondAndThird.map((r) => {
                    const player = byId.get(r.player_id);
                    const isSecond = r.rank === 2;
                    const isThird = r.rank === 3;

                    return (
                      <Card
                        key={r.player_id}
                        className={cx(
                          "relative flex flex-col items-center p-4 transition-all hover:border-line-strong",
                          isSecond ? "border-slate-400/40 bg-gradient-to-b from-slate-400/10 to-transparent" : "",
                          isThird ? "border-orange-500/40 bg-gradient-to-b from-orange-500/10 to-transparent" : ""
                        )}
                      >
                        {/* Rank header tag */}
                        <div className="mb-3 flex w-full items-center justify-center">
                          <span
                            className={cx(
                              "inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-wide",
                              isSecond
                                ? "bg-slate-400/20 text-slate-200 ring-1 ring-slate-400/50"
                                : isThird
                                ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/50"
                                : "bg-surface-2 text-subtle"
                            )}
                          >
                            {isSecond ? "🥈 2º" : isThird ? "🥉 3º" : `${r.rank}º`}
                          </span>
                        </div>

                        {/* Full Player Card */}
                        <div className="w-full max-w-[240px]">
                          <PlayerCard
                            name={r.name}
                            position={r.position}
                            points={r.score}
                            goals={r.goals}
                            assists={r.assists}
                            imageUrl={r.photo_url}
                            templateId={r.card_template || "card-template"}
                            className="shadow-xl transition-transform hover:scale-[1.02]"
                          />
                        </div>

                        {/* Edit Button for Staff */}
                        {isStaff && player && (
                          <div className="mt-3 flex w-full justify-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Pencil}
                              onClick={() => setEditing({ player, stat: r })}
                            >
                              Editar Jogador
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* 4th Place and Below: 4 on PC, 2 on mobile. No Card box, no repeated stats, just badge below */}
              {others.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-subtle">
                    Classificação Geral
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                    {others.map((r) => {
                      const player = byId.get(r.player_id);

                      return (
                        <div key={r.player_id} className="flex flex-col items-center">
                          {/* Full Player Card */}
                          <div className="w-full max-w-[240px]">
                            <PlayerCard
                              name={r.name}
                              position={r.position}
                              points={r.score}
                              goals={r.goals}
                              assists={r.assists}
                              imageUrl={r.photo_url}
                              templateId={r.card_template || "card-template"}
                              className="shadow-xl transition-transform hover:scale-[1.02]"
                            />
                          </div>

                          {/* Only Position Badge below the card */}
                          <div className="mt-2.5 flex items-center justify-center gap-1.5">
                            <span className="rounded-full bg-surface-2 px-3 py-0.5 text-xs font-bold text-subtle">
                              {r.rank}º
                            </span>

                            {isStaff && player && (
                              <IconButton
                                icon={Pencil}
                                label={`Editar ${r.name}`}
                                size="sm"
                                onClick={() => setEditing({ player, stat: r })}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === "table" && (
            <div className="space-y-3">
              {quickEdit && hasNoMatches && isStaff && (
                <Alert tone="info">
                  <strong>Modo Edição Rápida:</strong> use os botões <strong>+</strong> e <strong>-</strong> para ajustar gols e assistências de cada jogador em tempo real.
                </Alert>
              )}

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2/60 text-left text-[11px] uppercase tracking-wide text-subtle">
                      <tr>
                        <th className="w-10 px-3 py-2.5 sm:w-12 sm:px-4">#</th>
                        <th className="px-2 py-2.5">Jogador</th>
                        <th className="hidden px-2 py-2.5 sm:table-cell">Time</th>
                        <th
                          className={cx(
                            "px-1 py-2.5 text-center font-bold transition-all",
                            quickEdit && hasNoMatches && isStaff ? "w-28 sm:w-32" : "w-9 sm:w-12 sm:px-2"
                          )}
                          title="Gols"
                        >
                          {quickEdit && hasNoMatches && isStaff ? "Gols" : "G"}
                        </th>
                        <th
                          className={cx(
                            "px-1 py-2.5 text-center font-bold transition-all",
                            quickEdit && hasNoMatches && isStaff ? "w-28 sm:w-32" : "w-9 sm:w-12 sm:px-2"
                          )}
                          title="Assistências"
                        >
                          {quickEdit && hasNoMatches && isStaff ? "Assists" : "A"}
                        </th>
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
                                  r.rank === 1
                                    ? "bg-amber-500 text-black font-black"
                                    : r.rank === 2
                                    ? "bg-slate-300 text-black font-black"
                                    : r.rank === 3
                                    ? "bg-orange-600 text-white font-black"
                                    : "bg-surface-2 text-muted"
                                )}
                              >
                                {r.rank}
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                {/* Full miniature card shape (not circle) */}
                                <div className="h-12 w-9 shrink-0 overflow-hidden rounded shadow-sm">
                                  <img
                                    src={r.photo_url || "/cards/card-template.png"}
                                    alt={r.name}
                                    className="h-full w-full object-contain"
                                  />
                                </div>
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
                            <td className="px-1 py-2.5 text-center font-bold tabular text-fg sm:px-2">
                              {quickEdit && hasNoMatches && isStaff ? (
                                <div className="inline-flex items-center justify-center gap-1">
                                  <IconButton
                                    icon={Minus}
                                    label={`-1 Gol para ${r.name}`}
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 w-6"
                                    disabled={r.goals <= 0 || savingPlayerId === r.player_id}
                                    onClick={() => handleAdjustStat(r.player_id, -1, 0)}
                                  />
                                  <span className="w-5 text-center text-sm font-bold tabular text-fg">{r.goals}</span>
                                  <IconButton
                                    icon={Plus}
                                    label={`+1 Gol para ${r.name}`}
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 w-6"
                                    disabled={savingPlayerId === r.player_id}
                                    onClick={() => handleAdjustStat(r.player_id, 1, 0)}
                                  />
                                </div>
                              ) : (
                                r.goals
                              )}
                            </td>
                            <td className="px-1 py-2.5 text-center font-bold tabular text-fg sm:px-2">
                              {quickEdit && hasNoMatches && isStaff ? (
                                <div className="inline-flex items-center justify-center gap-1">
                                  <IconButton
                                    icon={Minus}
                                    label={`-1 Assistência para ${r.name}`}
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 w-6"
                                    disabled={r.assists <= 0 || savingPlayerId === r.player_id}
                                    onClick={() => handleAdjustStat(r.player_id, 0, -1)}
                                  />
                                  <span className="w-5 text-center text-sm font-bold tabular text-fg">{r.assists}</span>
                                  <IconButton
                                    icon={Plus}
                                    label={`+1 Assistência para ${r.name}`}
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 w-6"
                                    disabled={savingPlayerId === r.player_id}
                                    onClick={() => handleAdjustStat(r.player_id, 0, 1)}
                                  />
                                </div>
                              ) : (
                                r.assists
                              )}
                            </td>
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
                                  <IconButton
                                    icon={Pencil}
                                    label={`Editar ${r.name}`}
                                    size="sm"
                                    onClick={() => setEditing({ player, stat: r })}
                                  />
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
            </div>
          )}

          {/* Export Ranking Panel */}
          <ExportPanel title="Exportar ranking em imagem" filename="ranking" getText={getText} renderImage={renderImage} />
        </>
      )}

      {/* Enhanced Edit Player Modal for Admins & Moderators */}
      {editing && (
        <EditPlayerModal
          ctx={ctx}
          player={editing.player}
          stat={editing.stat}
          hasNoMatches={hasNoMatches}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast("Jogador e estatísticas atualizados");
            await Promise.all([load(), ctx.reloadPlayers(), ctx.reloadTeams()]);
          }}
        />
      )}
    </div>
  );
}

/** Complete Player & Event Stats Editor for Staff */
function EditPlayerModal({
  ctx,
  player,
  stat,
  hasNoMatches,
  onClose,
  onSaved,
}: {
  ctx: EventCtx;
  player: Player;
  stat?: RankingRow;
  hasNoMatches: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [position, setPosition] = useState(player.position ?? "MEI");
  const [templateId, setTemplateId] = useState(player.card_template || "card-template");
  const [goals, setGoals] = useState(stat?.goals ?? 0);
  const [assists, setAssists] = useState(stat?.assists ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // File pick for Encaixar Imagem no Card modal
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEditorFile(f);
    setEditorOpen(true);
    e.target.value = "";
  }

  // Handle save from CardEditorModal
  async function handleCardEditorSave({
    blob,
    position: newPos,
    templateId: newTemplateId,
  }: {
    blob: Blob;
    position: string;
    templateId: string;
  }) {
    setBusy(true);
    try {
      // 1. Upload card composite image
      const form = new FormData();
      form.append("file", blob, "card.png");
      form.append("is_card", "true");
      await api.postForm(`/groups/${ctx.group.id}/players/${player.id}/photo`, form);

      // 2. Save position & template
      await api.put(`/groups/${ctx.group.id}/players/${player.id}`, {
        position: newPos,
        card_template: newTemplateId,
      });

      // 3. Save manual stats if allowed
      if (hasNoMatches) {
        await api.put(`/events/${ctx.event.id}/stats/${player.id}`, {
          goals: Math.max(0, Number(goals) || 0),
          assists: Math.max(0, Number(assists) || 0),
        });
      }

      setEditorOpen(false);
      setEditorFile(null);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar a carta"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // 1. Save position & template
      await api.put(`/groups/${ctx.group.id}/players/${player.id}`, {
        position: position.trim().toUpperCase() || null,
        card_template: templateId,
      });

      // 2. Save manual stats if event has no matches
      if (hasNoMatches) {
        await api.put(`/events/${ctx.event.id}/stats/${player.id}`, {
          goals: Math.max(0, Number(goals) || 0),
          assists: Math.max(0, Number(assists) || 0),
        });
      }

      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar"));
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Editar ${player.name}`}
        description="Atualize a posição, modelo, foto e estatísticas deste jogador"
        icon={Pencil}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-5">
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            {/* Left: Card Preview & Frame Button */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[210px]">
                <PlayerCard
                  name={player.name}
                  position={position}
                  points={stat?.score ?? 0}
                  goals={goals}
                  assists={assists}
                  imageUrl={player.photo_url}
                  templateId={templateId}
                  className="shadow-xl"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Sparkles}
                className="mt-3 w-full max-w-[210px]"
                onClick={() => fileInputRef.current?.click()}
              >
                Encaixar Imagem no Card
              </Button>
            </div>

            {/* Right: Controls & Stats */}
            <div className="space-y-4">
              {/* Event Stats (if no matches registered) */}
              {hasNoMatches ? (
                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-fg">
                    <Goal size={15} className="text-brand-500" />
                    <span>Estatísticas deste Evento (Sem partidas registradas)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Gols no Evento">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={goals}
                        onChange={(e) => setGoals(Number(e.target.value))}
                        required
                      />
                    </Field>

                    <Field label="Assistências no Evento">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={assists}
                        onChange={(e) => setAssists(Number(e.target.value))}
                        required
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-subtle">
                  As estatísticas deste jogador estão vinculadas às partidas em andamento deste evento.
                </div>
              )}

              {/* Position Editor */}
              <div>
                <Field label="Posição">
                  <Input
                    value={position}
                    onChange={(e) => setPosition(e.target.value.toUpperCase())}
                    placeholder="Ex: ATA, MEI, CA, GOL..."
                    maxLength={10}
                  />
                </Field>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {POSITION_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosition(p)}
                      className={cx(
                        "rounded-lg px-2 py-1 text-xs font-bold transition-colors",
                        position === p
                          ? "bg-brand-600 text-white"
                          : "bg-surface-2 text-fg hover:bg-surface-3 border border-line"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Selection */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Modelo do Card
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {CARD_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cx(
                        "flex items-center gap-2 rounded-xl border p-2 text-left transition-all",
                        templateId === t.id
                          ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/30"
                          : "border-line bg-surface-2 hover:border-line-strong"
                      )}
                    >
                      <img src={t.fullUrl} alt={t.name} className="h-10 w-8 rounded object-contain" />
                      <span className="text-xs font-semibold text-fg">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>

      {/* Card Editor Modal for Photo Pan & Zoom */}
      <CardEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        file={editorFile}
        initialPosition={position}
        playerName={player.name}
        initialTemplateId={templateId}
        points={stat?.score ?? 0}
        goals={goals}
        assists={assists}
        onSave={handleCardEditorSave}
      />
    </>
  );
}
