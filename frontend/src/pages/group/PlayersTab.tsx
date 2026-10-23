import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileUp, Pencil, Plus, Search, Shirt, SlidersHorizontal, Trash2, UserPlus, Vote } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { GroupDetail, Player, PlayerVote } from "../../types";
import { useConfirm, useToast } from "../../components/Feedback";
import { PhotoPicker, PositionInput, savePhoto, type PhotoChange } from "../../components/PlayerFields";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Spinner,
} from "../../components/ui";
import { errorMessage, fmtSkill, plural } from "../../lib/format";
import { ApplyVotesModal } from "./ApplyVotesModal";
import { ImportPlayersModal, importSummary } from "./ImportPlayersModal";

export function SkillBar({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3 sm:w-28">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-sm font-semibold tabular text-fg sm:w-10">{fmtSkill(value)}</span>
    </div>
  );
}

export function PlayersTab({ group, onChange }: { group: GroupDetail; onChange: () => void }) {
  const isAdmin = group.role === "admin";
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applyingVotes, setApplyingVotes] = useState(false);
  const [voted, setVoted] = useState<Set<number> | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    try {
      setPlayers(await api.get<Player[]>(`/groups/${group.id}/players`));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar jogadores"));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, group.min_skill, group.max_skill]);

  useEffect(() => {
    api
      .get<PlayerVote[]>(`/groups/${group.id}/votes`)
      .then((votes) => setVoted(new Set(votes.map((v) => v.player_id))))
      .catch(() => setVoted(null));
  }, [group.id]);

  // Players the current member has not voted on yet (new ones included).
  const selfId = group.members.find((m) => m.user_id === user?.id)?.player_id ?? null;
  const pendingVotes =
    selfId !== null && voted && players ? players.filter((p) => p.id !== selfId && !voted.has(p.id)).length : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q)
    );
  }, [players, query]);

  async function remove(p: Player) {
    const ok = await confirm({
      title: `Remover ${p.name}?`,
      message: "As estatísticas do jogador nas partidas também serão apagadas. Para mantê-las, desative o jogador.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/groups/${group.id}/players/${p.id}`);
      toast(`${p.name} removido`);
      load();
      onChange();
    } catch (err) {
      toast(errorMessage(err, "Falha ao remover"), { tone: "error" });
    }
  }

  if (players === null) return error ? <Alert>{error}</Alert> : <Spinner label="Carregando jogadores..." />;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jogador ou posição" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={Vote}
            onClick={() => navigate(`/groups/${group.id}/vote`)}
            title={pendingVotes ? `${plural(pendingVotes, "jogador", "jogadores")} sem o seu voto` : "Votar nas notas dos jogadores"}
          >
            Votação
            {pendingVotes > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold leading-[18px] text-white tabular">
                {pendingVotes}
              </span>
            )}
          </Button>
          {isAdmin && (
            <>
              <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setApplyingVotes(true)}>
                Atualizar notas
              </Button>
              <Button variant="secondary" icon={FileUp} onClick={() => setImporting(true)}>
                Importar
              </Button>
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Jogador
              </Button>
            </>
          )}
        </div>
      </div>

      {players.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title="Nenhum jogador cadastrado"
          description={
            isAdmin
              ? "Cadastre jogadores para poder sortear os times."
              : "Os administradores ainda não cadastraram jogadores."
          }
          action={
            isAdmin && (
              <Button icon={UserPlus} onClick={() => setCreating(true)}>
                Cadastrar jogador
              </Button>
            )
          }
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40">
              <Avatar name={p.name} src={p.photo_url} size={40} className={p.active ? "" : "opacity-50 grayscale"} />
              {/* Phones move the nota next to the position, so the name gets the whole width and wraps instead of being cut. */}
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 sm:gap-x-3">
                <p className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-fg sm:col-span-1">
                  <span className="min-w-0 break-words">{p.name}</span>
                  {!p.active && <Badge>inativo</Badge>}
                </p>
                <p className="truncate text-xs text-subtle">{p.position || "Sem posição"}</p>
                <div className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
                  <SkillBar value={p.skill} min={group.min_skill} max={group.max_skill} />
                </div>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-0.5">
                  <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => setEditing(p)} />
                  <IconButton icon={Trash2} label="Remover" size="sm" onClick={() => remove(p)} />
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nenhum jogador encontrado.</p>}
        </Card>
      )}
      <p className="text-xs text-subtle">
        {players.length} jogador(es) · {players.filter((p) => p.active).length} ativos
      </p>

      {isAdmin && (
        <>
          <PlayerModal
            open={creating || editing !== null}
            player={editing}
            group={group}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={(created) => {
              setCreating(false);
              setEditing(null);
              load();
              if (created) onChange();
            }}
          />
          <ImportPlayersModal
            open={importing}
            group={group}
            onClose={() => setImporting(false)}
            onImported={(result) => {
              setImporting(false);
              toast(`Importação concluída: ${importSummary(result)}`);
              load();
              onChange();
            }}
          />
          <ApplyVotesModal
            open={applyingVotes}
            group={group}
            onClose={() => setApplyingVotes(false)}
            onApplied={(updated) => {
              setApplyingVotes(false);
              toast(`${plural(updated, "nota atualizada", "notas atualizadas")} pela votação`);
              load();
            }}
          />
        </>
      )}
    </div>
  );
}

export function PlayerModal({
  open,
  player,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  player: Player | null;
  group: GroupDetail;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const mid = Math.round(((group.min_skill + group.max_skill) / 2) * 100) / 100;
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [skill, setSkill] = useState(String(mid));
  const [active, setActive] = useState(true);
  const [photo, setPhoto] = useState<PhotoChange>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? "");
    setPosition(player?.position ?? "");
    setSkill(String(player?.skill ?? mid));
    setActive(player?.active ?? true);
    setPhoto(null);
    setError(null);
  }, [player, open, mid]);

  const value = Number(skill.replace(",", "."));
  const step = group.max_skill - group.min_skill <= 10 ? 0.01 : 0.1;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(value) || value < group.min_skill || value > group.max_skill) {
      setError(`A nota deve estar entre ${fmtSkill(group.min_skill)} e ${fmtSkill(group.max_skill)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const body = { name, position: position.trim() || null, skill: value, active };
    try {
      const saved = player
        ? await api.put<Player>(`/groups/${group.id}/players/${player.id}`, body)
        : await api.post<Player>(`/groups/${group.id}/players`, body);
      await savePhoto(group.id, saved.id, photo);
      onSaved(!player);
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar jogador"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={player ? "Editar jogador" : "Novo jogador"} icon={player ? Pencil : UserPlus}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <PhotoPicker
          name={name}
          currentUrl={player?.photo_url ?? null}
          value={photo}
          onChange={setPhoto}
          onError={setError}
        />
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={120} />
        </Field>
        <Field label="Posição (opcional)">
          <PositionInput value={position} onChange={setPosition} />
        </Field>
        <Field
          label="Nota de habilidade"
          hint={`Faixa do grupo: ${fmtSkill(group.min_skill)} a ${fmtSkill(group.max_skill)}`}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={group.min_skill}
              max={group.max_skill}
              step={step}
              value={Number.isFinite(value) ? value : mid}
              onChange={(e) => setSkill(e.target.value)}
              className="w-full accent-brand-600"
            />
            <Input
              type="number"
              min={group.min_skill}
              max={group.max_skill}
              step={step}
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="w-24 text-right tabular"
            />
          </div>
        </Field>
        <Checkbox
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          label="Jogador ativo"
          description="Jogadores ativos já vêm selecionados no sorteio."
        />
        <div className="flex justify-end gap-2 pt-1">
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
