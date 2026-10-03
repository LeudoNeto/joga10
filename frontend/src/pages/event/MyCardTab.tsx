import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  Download,
  ExternalLink,
  Footprints,
  Goal,
  Info,
  Pencil,
  Share2,
  Sparkles,
  Trophy,
  UserCheck,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Feedback";
import { PlayerCard } from "../../components/PlayerCard";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Spinner,
} from "../../components/ui";
import { errorMessage, formatDate } from "../../lib/format";
import { CARD_FOOTER_TIERS, getDefaultFooterQuote } from "../../lib/cards";
import { downloadCanvas, drawSingleCardPoster } from "../../lib/exportImage";
import type { Match, RankingRow } from "../../types";
import type { EventCtx } from "../EventPage";

export function MyCardTab({ ctx }: { ctx: EventCtx }) {
  const { event, group, players } = ctx;
  const { user } = useAuth();
  const toast = useToast();

  const me = group.members.find((m) => m.user_id === user?.id);
  const linked = me?.player_id != null ? players.find((p) => p.id === me.player_id) : null;

  const [stats, setStats] = useState<RankingRow[] | null>(null);
  const [hasNoMatches, setHasNoMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Stats edit modal (when no matches exist)
  const [editingStats, setEditingStats] = useState(false);
  const [editGoals, setEditGoals] = useState(0);
  const [editAssists, setEditAssists] = useState(0);
  const [savingStats, setSavingStats] = useState(false);

  // Export poster states
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [isCustomFooter, setIsCustomFooter] = useState(false);
  const [exportRendering, setExportRendering] = useState(false);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  const myStat = stats?.find((r) => r.player_id === linked?.id);
  const currentGoals = myStat?.goals ?? 0;
  const currentAssists = myStat?.assists ?? 0;
  const currentScore = myStat?.score ?? 0;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, matchesRes] = await Promise.all([
        api.get<RankingRow[]>(`/events/${event.id}/stats`),
        api.get<Match[]>(`/events/${event.id}/matches`),
      ]);
      setStats(statsRes);
      setHasNoMatches(matchesRes.length === 0);
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar dados do card"));
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync default header text with event date
  useEffect(() => {
    const formattedDate = event.date ? formatDate(event.date) : formatDate(new Date().toISOString().split("T")[0]);
    setHeaderText((prev) => (prev ? prev : `Seu Card - ${formattedDate}`));
  }, [event.date]);

  // Sync default footer quote with current player score
  useEffect(() => {
    if (!isCustomFooter) {
      const quote = getDefaultFooterQuote(currentScore);
      setSelectedPreset(quote);
      setFooterText(quote);
    }
  }, [currentScore, isCustomFooter]);

  // Live Canvas render effect
  useEffect(() => {
    if (!linked || !exportCanvasRef.current) return;
    let cancelled = false;
    setExportRendering(true);

    const cardData = {
      name: linked.name,
      position: linked.position,
      score: currentScore,
      goals: currentGoals,
      assists: currentAssists,
      photoUrl: linked.photo_url,
      templateId: linked.card_template || "card-template",
    };

    const header = headerText.trim() || `Seu Card - ${event.date ? formatDate(event.date) : ""}`;

    drawSingleCardPoster(exportCanvasRef.current, cardData, header, footerText)
      .then(() => {
        if (!cancelled) setExportRendering(false);
      })
      .catch((err) => {
        console.error("Poster render error:", err);
        if (!cancelled) setExportRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    linked,
    currentScore,
    currentGoals,
    currentAssists,
    headerText,
    footerText,
    event.date,
  ]);

  if (loading && !stats) {
    return <Spinner label="Carregando seu card do evento..." />;
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  // User is not linked to any player in this group
  if (!linked) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={UserCheck}
          title="Você ainda não tem um jogador vinculado"
          description="Para ver e personalizar o seu card, associe sua conta a um dos jogadores do grupo."
          action={
            <Link to={`/groups/${group.id}?tab=me`}>
              <Button icon={UserCheck}>Ir para 'Seu Jogador'</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  function handleDownloadPoster() {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    const safeName = (linked?.name || "card").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadCanvas(canvas, `card-${safeName}.png`);
    toast("Pôster baixado com sucesso!");
  }

  async function handleCopyPoster() {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Falha ao gerar blob");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Imagem copiada para a área de transferência!");
    } catch {
      toast("Não foi possível copiar automaticamente — utilize o botão Baixar PNG", { tone: "error" });
    }
  }

  function openEditStats() {
    setEditGoals(currentGoals);
    setEditAssists(currentAssists);
    setEditingStats(true);
  }

  async function handleSaveStats(e: React.FormEvent) {
    e.preventDefault();
    setSavingStats(true);
    try {
      await api.put(`/events/${event.id}/stats/${linked!.id}`, {
        goals: Math.max(0, Number(editGoals) || 0),
        assists: Math.max(0, Number(editAssists) || 0),
      });
      toast("Estatísticas atualizadas com sucesso!");
      setEditingStats(false);
      await loadData();
    } catch (err) {
      toast(errorMessage(err, "Falha ao atualizar estatísticas"), { tone: "error" });
    } finally {
      setSavingStats(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        {/* Left: Player Card Display */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[320px]">
            <PlayerCard
              name={linked.name}
              position={linked.position}
              points={currentScore}
              goals={currentGoals}
              assists={currentAssists}
              imageUrl={linked.photo_url}
              templateId={linked.card_template || "card-template"}
              className="shadow-2xl transition-transform hover:scale-[1.02]"
            />
          </div>

          <p className="mt-3 text-center text-xs text-subtle">
            Card oficial do evento com suas estatísticas calculadas.
          </p>
        </div>

        {/* Right: Event Stats Summary and Actions */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <SectionTitle
              icon={Sparkles}
              title={`Card de ${linked.name}`}
              description="Visualização com os gols, assistências e pontuação registrados neste evento."
            />

            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-line bg-surface-2 p-3 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Pontos
                </span>
                <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-black text-fg">
                  <Trophy size={18} className="text-amber-500" />
                  {currentScore}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-3 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Gols
                </span>
                <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-black text-fg">
                  <Goal size={18} className="text-emerald-500" />
                  {currentGoals}
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-3 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Assists
                </span>
                <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-black text-fg">
                  <Footprints size={18} className="text-blue-500" />
                  {currentAssists}
                </p>
              </div>
            </div>

            {/* Actions for the Player's Card */}
            <div className="flex flex-wrap gap-3 pt-2">
              {hasNoMatches ? (
                <Button icon={Pencil} onClick={openEditStats}>
                  Alterar Estatísticas do Evento
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-3 text-xs text-subtle">
                  <Info size={15} className="shrink-0 text-brand-500" />
                  <span>
                    As estatísticas deste evento estão sendo computadas automaticamente pelas partidas
                    em andamento.
                  </span>
                </div>
              )}

              <Link to={`/groups/${group.id}?tab=me`}>
                <Button variant="secondary" icon={ExternalLink}>
                  Editar Foto e Modelo em 'Seu Jogador'
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="space-y-3 p-5 text-xs text-muted leading-relaxed">
            <h4 className="font-semibold text-fg">Sobre o seu card no evento</h4>
            <p>
              O modelo de moldura e o enquadramento da foto são sincronizados com as configurações
              feitas na aba <strong>"Seu Jogador"</strong> do grupo.
            </p>
            <p>
              Os pontos (PTS) e as estatísticas de Gols e Assistências refletem seu desempenho
              especificamente neste evento.
            </p>
          </Card>
        </div>
      </div>

      {/* Export Section */}
      <Card className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <SectionTitle
            icon={Share2}
            title="Exportar Card"
            description="Personalize o cabeçalho e a frase de efeito para gerar um pôster em alta resolução (PNG) pronto para compartilhar."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Copy}
              disabled={exportRendering}
              onClick={handleCopyPoster}
            >
              Copiar Imagem
            </Button>
            <Button
              size="sm"
              icon={Download}
              disabled={exportRendering}
              onClick={handleDownloadPoster}
            >
              Baixar PNG
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
          {/* Form controls */}
          <div className="space-y-5">
            {/* Header input */}
            <Field
              label="Cabeçalho do Pôster"
              hint="Título exibido em destaque dourado no topo do pôster"
            >
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder={`Seu Card - ${formatDate(event.date)}`}
              />
            </Field>

            {/* Footer / Quote select & custom input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-fg">
                  Frase do Rodapé
                </label>
                <span className="text-[11px] font-medium text-subtle">
                  {currentScore >= 90
                    ? "🏆 Tier Craque"
                    : currentScore >= 60
                    ? "⚡ Tier Regular"
                    : "🔥 Tier Provocação"}
                </span>
              </div>

              {!isCustomFooter ? (
                <div className="space-y-2">
                  <Select
                    value={selectedPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setIsCustomFooter(true);
                        setSelectedPreset("custom");
                      } else {
                        setSelectedPreset(val);
                        setFooterText(val);
                      }
                    }}
                  >
                    {CARD_FOOTER_TIERS.map((tier) => (
                      <optgroup key={tier.id} label={tier.name}>
                        {tier.quotes.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Personalização">
                      <option value="custom">✍️ Digitar frase personalizada...</option>
                    </optgroup>
                  </Select>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomFooter(true);
                      setSelectedPreset("custom");
                    }}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium"
                  >
                    <Pencil size={13} /> Personalizar texto livremente
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Digite sua frase personalizada para o rodapé..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomFooter(false);
                      const quote = getDefaultFooterQuote(currentScore);
                      setSelectedPreset(quote);
                      setFooterText(quote);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-subtle hover:text-fg"
                  >
                    ↩️ Voltar às frases sugeridas
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-xs text-subtle space-y-1.5 leading-relaxed">
              <p className="font-semibold text-fg flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" /> Formato Pôster / Story
              </p>
              <p>
                A imagem é renderizada com as cores e moldura oficiais na proporção vertical em alta definição (1040 × 1600 px), perfeita para redes sociais, WhatsApp ou Stories do Instagram.
              </p>
            </div>
          </div>

          {/* Right: Live Canvas Preview */}
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[320px] overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl">
              {exportRendering && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <Spinner label="Gerando pôster..." />
                </div>
              )}
              <canvas
                ref={exportCanvasRef}
                className="block h-auto w-full"
                style={{ aspectRatio: "1040 / 1600" }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-subtle">
              Pré-visualização do pôster gerado
            </p>
          </div>
        </div>
      </Card>

      {/* Edit Stats Modal (Only when no matches exist) */}
      {editingStats && (
        <Modal
          open
          onClose={() => setEditingStats(false)}
          title="Alterar Estatísticas do Evento"
          description={`Defina seus gols e assistências para ${event.title}`}
          icon={Pencil}
          size="sm"
        >
          <form onSubmit={handleSaveStats} className="space-y-4">
            <Field label="Gols neste evento" hint="Número total de gols marcados">
              <Input
                type="number"
                min={0}
                max={100}
                value={editGoals}
                onChange={(e) => setEditGoals(Number(e.target.value))}
                required
              />
            </Field>

            <Field label="Assistências neste evento" hint="Número total de passes para gol">
              <Input
                type="number"
                min={0}
                max={100}
                value={editAssists}
                onChange={(e) => setEditAssists(Number(e.target.value))}
                required
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditingStats(false)}
                disabled={savingStats}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={savingStats}>
                Salvar Estatísticas
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
