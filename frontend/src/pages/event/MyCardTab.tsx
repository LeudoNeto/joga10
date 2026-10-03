import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Footprints,
  Goal,
  Info,
  Pencil,
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
  Spinner,
} from "../../components/ui";
import { errorMessage } from "../../lib/format";
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

  const myStat = stats?.find((r) => r.player_id === linked.id);
  const currentGoals = myStat?.goals ?? 0;
  const currentAssists = myStat?.assists ?? 0;
  const currentScore = myStat?.score ?? 0;

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
