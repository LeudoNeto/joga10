import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Lock,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Spinner,
  cx,
} from "../../components/ui";
import { errorMessage } from "../../lib/format";
import {
  CARD_TEMPLATES,
  getTemplate,
  POSITION_PRESETS,
  type CardTemplate,
} from "../../lib/cards";
import { PlayerCard } from "../../components/PlayerCard";
import { CardEditorModal } from "../../components/CardEditorModal";
import type { GroupDetail, Player } from "../../types";

/** "Seu Jogador": the current user picks which player of the group they are,
 * customizes their position (ATA, MEI, CA, GOL...), downloads templates for AI,
 * and frames their photo using the interactive card editor. */
export function MyPlayerTab({
  group,
  onChange,
}: {
  group: GroupDetail;
  onChange: (detail: GroupDetail) => void;
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const isStaff = group.role === "admin" || group.role === "moderator";
  const me = group.members.find((m) => m.user_id === user?.id);

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  // Position editing
  const [customPos, setCustomPos] = useState("");

  // Card template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState("card-template");

  // Card editor modal
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  async function loadPlayers() {
    try {
      const res = await api.get<Player[]>(`/groups/${group.id}/players`);
      setPlayers(res);
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar jogadores"));
    }
  }

  useEffect(() => {
    loadPlayers();
  }, [group.id]);

  // Sync position & template when linked player changes
  const linked = useMemo(
    () => (me?.player_id != null && players ? players.find((p) => p.id === me.player_id) : undefined),
    [me?.player_id, players]
  );

  useEffect(() => {
    if (linked) {
      setCustomPos(linked.position || "MEI");
      if (linked.card_template) {
        setSelectedTemplateId(linked.card_template);
      }
    }
  }, [linked]);

  // player id -> name of the member who already claimed it
  const claimedBy = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of group.members) {
      if (m.player_id != null && m.user_id !== me?.user_id) {
        map.set(m.player_id, m.name);
      }
    }
    return map;
  }, [group.members, me?.user_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(claimedBy.has(a.id)) - Number(claimedBy.has(b.id)) || Number(b.active) - Number(a.active));
  }, [players, query, claimedBy]);

  if (!me) return null;
  if (error) return <Alert>{error}</Alert>;
  if (!players) return <Spinner label="Carregando jogadores..." />;

  const picking = me.player_id == null || (isStaff && changing);
  const choice = players.find((p) => p.id === selected);

  async function saveInitialPlayer() {
    if (!choice) return;
    const ok = await confirm({
      title: `Você é ${choice.name}?`,
      message: isStaff ? (
        "Seu usuário ficará associado a este jogador. Como administrador/moderador, você poderá alterar depois."
      ) : (
        <>
          Seu usuário ficará associado a <strong>{choice.name}</strong>.{" "}
          <strong>Essa escolha não poderá ser alterada depois</strong> — somente administradores ou moderadores do
          grupo podem mudá-la.
        </>
      ),
      confirmLabel: "Sim, sou eu",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await api.put<GroupDetail>(
        `/groups/${group.id}/members/${me!.user_id}/player`,
        { player_id: choice.id }
      );
      onChange(updated);
      toast(`Agora você é ${choice.name}`);
      setChanging(false);
      setSelected(null);
      await loadPlayers();
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Update position
  async function savePosition(newPosition: string) {
    if (!linked) return;
    const clean = newPosition.trim().toUpperCase();
    setBusy(true);
    try {
      await api.put(`/groups/${group.id}/players/${linked.id}`, {
        position: clean || null,
        card_template: selectedTemplateId,
      });
      setCustomPos(clean);
      toast(`Posição atualizada para ${clean || "—"}`);
      const updated = await api.get<GroupDetail>(`/groups/${group.id}`);
      onChange(updated);
      await loadPlayers();
    } catch (err) {
      toast(errorMessage(err, "Falha ao atualizar posição"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Update card template
  async function saveTemplate(newTemplateId: string) {
    if (!linked) return;
    setBusy(true);
    setSelectedTemplateId(newTemplateId);
    try {
      await api.put(`/groups/${group.id}/players/${linked.id}`, {
        card_template: newTemplateId,
        position: customPos.trim().toUpperCase() || linked.position || null,
      });
      const tpl = getTemplate(newTemplateId);
      toast(`Modelo de card alterado para "${tpl.name}"`);
      const updated = await api.get<GroupDetail>(`/groups/${group.id}`);
      onChange(updated);
      await loadPlayers();
    } catch (err) {
      setSelectedTemplateId(linked.card_template || "card-template");
      toast(errorMessage(err, "Falha ao alterar modelo do card"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Download template image (the one without empty)
  function handleDownloadTemplate(t: CardTemplate) {
    const link = document.createElement("a");
    link.href = t.fullUrl;
    link.download = `${t.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Download do template "${t.name}" iniciado!`);
  }

  // File pick for card editor
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Por favor selecione um arquivo de imagem (PNG, JPG ou WEBP)", { tone: "error" });
      return;
    }
    setEditorFile(f);
    setEditorOpen(true);
    e.target.value = "";
  }

  // Save from CardEditorModal
  async function handleEditorSave({
    blob,
    position: newPos,
    templateId: newTemplateId,
  }: {
    blob: Blob;
    position: string;
    templateId: string;
  }) {
    if (!linked) return;
    setBusy(true);
    try {
      // 1. Upload card composite image
      const form = new FormData();
      form.append("file", blob, "card.png");
      form.append("is_card", "true");
      await api.postForm(`/groups/${group.id}/players/${linked.id}/photo`, form);

      // 2. Save position & template
      await api.put(`/groups/${group.id}/players/${linked.id}`, {
        position: newPos,
        card_template: newTemplateId,
      });

      setSelectedTemplateId(newTemplateId);
      setCustomPos(newPos);
      toast("Sua carta foi salva com sucesso!");

      const updated = await api.get<GroupDetail>(`/groups/${group.id}`);
      onChange(updated);
      await loadPlayers();
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar a carta"), { tone: "error" });
      throw err;
    } finally {
      setBusy(false);
    }
  }

  // Remove photo
  async function removePhoto() {
    if (!linked) return;
    const ok = await confirm({
      title: "Remover foto do card?",
      message: "Sua foto personalizada será removida e o card voltará ao fundo padrão.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.del(`/groups/${group.id}/players/${linked.id}/photo`);
      toast("Foto removida com sucesso");
      const updated = await api.get<GroupDetail>(`/groups/${group.id}`);
      onChange(updated);
      await loadPlayers();
    } catch (err) {
      toast(errorMessage(err, "Falha ao remover foto"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Unassociated state or admin/mod switching */}
      {picking && (
        <Card className="space-y-4 p-5">
          <SectionTitle
            icon={UserCheck}
            title={changing ? "Alterar seu jogador" : "Qual jogador é você?"}
            description="Escolha o jogador deste grupo que representa você."
            actions={
              changing && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={X}
                  onClick={() => {
                    setChanging(false);
                    setSelected(null);
                  }}
                >
                  Cancelar
                </Button>
              )
            }
          />
          {!isStaff && (
            <Alert tone="warning">
              Atenção: depois de confirmar, você <strong>não poderá alterar</strong> o seu jogador. Somente
              administradores ou moderadores podem mudá-lo.
            </Alert>
          )}
          {players.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="Nenhum jogador cadastrado"
              description="Peça a um administrador para cadastrar os jogadores do grupo."
            />
          ) : (
            <>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar jogador..."
                  className="pl-9"
                />
              </div>
              <div className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
                {filtered.map((p) => {
                  const owner = claimedBy.get(p.id);
                  const active = selected === p.id;
                  const current = p.id === me.player_id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!!owner || current}
                      onClick={() => setSelected(p.id)}
                      className={cx(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        active ? "border-brand-500 bg-brand-600/10" : "border-line hover:border-line-strong hover:bg-surface-2"
                      )}
                    >
                      <Avatar name={p.name} src={p.photo_url} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{p.name}</p>
                        <p className="truncate text-xs text-subtle">
                          {owner ? `associado a ${owner}` : current ? "seu jogador atual" : p.position || "—"}
                        </p>
                      </div>
                      {active && <Check size={18} className="shrink-0 text-accent" />}
                    </button>
                  );
                })}
                {filtered.length === 0 && <p className="text-sm text-muted">Nenhum jogador encontrado.</p>}
              </div>
              <div className="flex justify-end">
                <Button icon={Check} disabled={!choice} loading={busy} onClick={saveInitialPlayer}>
                  {choice ? `Confirmar: sou ${choice.name}` : "Selecione um jogador"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* 2. Main Player Profile & Card Customizer */}
      {me.player_id != null && !picking && linked && (
        <div className="space-y-6">
          {/* Header Summary Card */}
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <Avatar name={linked.name} src={linked.photo_url} size={56} />
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Seu Jogador</span>
                <h2 className="text-2xl font-bold tracking-tight text-fg">{linked.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone="brand">{customPos || linked.position || "SEM POSIÇÃO"}</Badge>
                  {linked.active ? (
                    <Badge tone="green">Ativo</Badge>
                  ) : (
                    <Badge tone="amber">Inativo</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isStaff ? (
                <Button variant="secondary" icon={Pencil} onClick={() => setChanging(true)}>
                  Trocar de Jogador
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-subtle">
                  <Lock size={13} className="shrink-0" />
                  Jogador vinculado à sua conta.
                </p>
              )}
            </div>
          </Card>

          {/* Card Showcase & Customizer Grid */}
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Left: Card Display */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[300px]">
                <PlayerCard
                  name={linked.name}
                  position={customPos || linked.position}
                  points={55}
                  goals={5}
                  assists={5}
                  imageUrl={linked.photo_url}
                  templateId={selectedTemplateId}
                  className="shadow-2xl"
                />
              </div>

              {/* Action Buttons under the card */}
              <div className="mt-4 flex w-full max-w-[300px] flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <Button
                  icon={Sparkles}
                  onClick={() => fileInputRef.current?.click()}
                  loading={busy}
                  className="w-full"
                >
                  {linked.photo_url ? "Editar Foto do Card" : "Enviar Foto para o Card"}
                </Button>

                {linked.photo_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={removePhoto}
                    disabled={busy}
                    className="text-red-500 hover:text-red-600"
                  >
                    Remover Foto
                  </Button>
                )}
              </div>
            </div>

            {/* Right: Customization Controls */}
            <div className="space-y-6">
              {/* Position Editor */}
              <Card className="space-y-4 p-5">
                <SectionTitle
                  icon={Pencil}
                  title="Alterar Posição"
                  description="Defina sua posição no campo (aparece no canto superior esquerdo do seu card)."
                />

                <div className="flex flex-wrap gap-2">
                  {POSITION_PRESETS.map((p) => {
                    const active = customPos.toUpperCase() === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => savePosition(p)}
                        className={cx(
                          "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all",
                          active
                            ? "bg-brand-600 text-white shadow-sm ring-2 ring-brand-500/40"
                            : "border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <div className="flex max-w-sm gap-2">
                  <Input
                    value={customPos}
                    onChange={(e) => setCustomPos(e.target.value.toUpperCase())}
                    placeholder="Outra posição..."
                    maxLength={10}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => savePosition(customPos)}
                    loading={busy}
                  >
                    Salvar
                  </Button>
                </div>
              </Card>

              {/* Template Selection & AI Download */}
              <Card className="space-y-4 p-5">
                <SectionTitle
                  icon={Sparkles}
                  title="Modelos de Card & Efeitos com IA"
                  description="Escolha o estilo do seu card e baixe o template limpo para criar efeitos com IA."
                />

                {/* Templates Grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {CARD_TEMPLATES.map((t) => {
                    const isSelected = selectedTemplateId === t.id;
                    return (
                      <div
                        key={t.id}
                        className={cx(
                          "flex flex-col justify-between rounded-2xl border p-4 transition-all",
                          isSelected
                            ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/30"
                            : "border-line bg-surface-2 hover:border-line-strong"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={t.fullUrl}
                            alt={t.name}
                            className="h-20 w-16 shrink-0 rounded-lg object-contain shadow-md"
                          />
                          <div>
                            <p className="font-bold text-fg">{t.name}</p>
                            <p className="text-xs text-subtle">{t.description}</p>
                            {isSelected && (
                              <Badge tone="brand" className="mt-1">
                                Selecionado
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={isSelected ? "primary" : "secondary"}
                            disabled={busy || isSelected}
                            onClick={() => saveTemplate(t.id)}
                          >
                            {isSelected ? "Em uso" : "Usar este"}
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            icon={Download}
                            onClick={() => handleDownloadTemplate(t)}
                            title="Baixar template sem textos para editar com IA"
                          >
                            Baixar Template
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AI Tip Box */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2.5">
                    <Sparkles size={18} className="mt-0.5 shrink-0 text-amber-500" />
                    <div className="space-y-1.5">
                      <p className="font-semibold text-fg">
                        Dica: Crie uma arte épica com Inteligência Artificial!
                      </p>
                      <p className="text-xs leading-relaxed text-muted">
                        Clique em <strong>"Baixar Template"</strong> acima para obter a imagem de fundo.
                        Depois, envie o template e sua foto para uma IA (como ChatGPT Plus / DALL-E,
                        Midjourney, etc.) com a instrução:
                      </p>
                      <blockquote className="rounded-lg border border-amber-400/30 bg-surface/60 p-2 text-xs italic text-fg">
                        "Coloque minha foto recortada dentro deste card de futebol, com efeito de iluminação profissional e fumaça ao fundo, mas <strong>SEM nenhum texto</strong> no card."
                      </blockquote>
                      <p className="text-xs text-muted">
                        Quando tiver a imagem gerada, clique em <strong>"Enviar Foto para o Card"</strong>.
                        O editor permitirá encaixar e ajustar o zoom com precisão!
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Interactive Card Editor Modal */}
          <CardEditorModal
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            file={editorFile}
            initialPosition={customPos || linked.position}
            playerName={linked.name}
            initialTemplateId={selectedTemplateId}
            onSave={handleEditorSave}
          />
        </div>
      )}
    </div>
  );
}
