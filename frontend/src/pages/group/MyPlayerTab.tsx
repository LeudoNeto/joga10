import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Pencil, Search, UserCheck, X } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useConfirm, useToast } from "../../components/Feedback";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, SectionTitle, Spinner, cx } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import type { GroupDetail, Player } from "../../types";

/** "Seu Jogador": the current user picks which player of the group they are.
 * Members choose once (it cannot be changed afterwards); admins and
 * moderators can change it at any time. */
export function MyPlayerTab({ group, onChange }: { group: GroupDetail; onChange: (detail: GroupDetail) => void }) {
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

  useEffect(() => {
    api
      .get<Player[]>(`/groups/${group.id}/players`)
      .then(setPlayers)
      .catch((err) => setError(errorMessage(err, "Falha ao carregar jogadores")));
  }, [group.id]);

  // player id -> name of the member who already claimed it
  const claimedBy = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of group.members) if (m.player_id != null && m.user_id !== me?.user_id) map.set(m.player_id, m.name);
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

  const linked = me.player_id != null ? players.find((p) => p.id === me.player_id) : undefined;
  const picking = me.player_id == null || (isStaff && changing);
  const choice = players.find((p) => p.id === selected);

  async function save() {
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
      onChange(await api.put<GroupDetail>(`/groups/${group.id}/members/${me!.user_id}/player`, { player_id: choice.id }));
      toast(`Agora você é ${choice.name}`);
      setChanging(false);
      setSelected(null);
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {me.player_id != null && !picking && (
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <Avatar name={me.player_name ?? "?"} src={me.player_photo_url} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Seu jogador</p>
            <p className="truncate text-xl font-bold text-fg">{me.player_name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {linked?.position && <Badge>{linked.position}</Badge>}
              {linked && !linked.active && <Badge tone="amber">inativo</Badge>}
            </div>
          </div>
          {isStaff ? (
            <Button variant="secondary" icon={Pencil} onClick={() => setChanging(true)}>
              Alterar
            </Button>
          ) : (
            <p className="flex max-w-xs items-center gap-1.5 text-xs text-subtle">
              <Lock size={13} className="shrink-0" /> Para alterar, peça a um administrador ou moderador do grupo.
            </p>
          )}
        </Card>
      )}

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
                <Button icon={Check} disabled={!choice} loading={busy} onClick={save}>
                  {choice ? `Confirmar: sou ${choice.name}` : "Selecione um jogador"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
