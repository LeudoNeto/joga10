import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Player } from "../../types";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
} from "../../components/ui";
import { ImportPlayersModal } from "./ImportPlayersModal";

function SkillBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-pitch-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm font-medium text-slate-600">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function PlayersTab({
  groupId,
  isAdmin,
}: {
  groupId: number;
  isAdmin: boolean;
}) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    try {
      setPlayers(await api.get<Player[]>(`/groups/${groupId}/players`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar jogadores");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function remove(p: Player) {
    if (!confirm(`Remover ${p.name}?`)) return;
    await api.del(`/groups/${groupId}/players/${p.id}`);
    load();
  }

  if (players === null) return <Spinner label="Carregando jogadores..." />;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {flash && <Alert tone="success">{flash}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {players.length} jogador(es) cadastrados
        </p>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Importar
            </Button>
            <Button onClick={() => setCreating(true)}>+ Jogador</Button>
          </div>
        )}
      </div>

      {players.length === 0 ? (
        <EmptyState
          title="Nenhum jogador cadastrado"
          description={
            isAdmin
              ? "Cadastre jogadores para poder sortear os times."
              : "Os administradores ainda não cadastraram jogadores."
          }
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-[140px]">
                <p className="font-medium text-slate-800">
                  {p.name}
                  {!p.active && (
                    <span className="ml-2 text-xs text-slate-400">(inativo)</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {p.position || "Sem posição"}
                </p>
              </div>
              <SkillBar value={p.skill} />
              {isAdmin && (
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => remove(p)}>
                    🗑️
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {isAdmin && (
        <>
          <PlayerModal
            open={creating || editing !== null}
            player={editing}
            groupId={groupId}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={() => {
              setCreating(false);
              setEditing(null);
              load();
            }}
          />
          <ImportPlayersModal
            open={importing}
            groupId={groupId}
            onClose={() => setImporting(false)}
            onImported={(count) => {
              setImporting(false);
              setFlash(`${count} jogador(es) importado(s) com sucesso.`);
              setTimeout(() => setFlash(null), 4000);
              load();
            }}
          />
        </>
      )}
    </div>
  );
}

function PlayerModal({
  open,
  player,
  groupId,
  onClose,
  onSaved,
}: {
  open: boolean;
  player: Player | null;
  groupId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [skill, setSkill] = useState(5);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(player?.name ?? "");
    setPosition(player?.position ?? "");
    setSkill(player?.skill ?? 5);
    setActive(player?.active ?? true);
    setError(null);
  }, [player, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name, position: position || null, skill, active };
    try {
      if (player) await api.put(`/groups/${groupId}/players/${player.id}`, body);
      else await api.post(`/groups/${groupId}/players`, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar jogador");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={player ? "Editar jogador" : "Novo jogador"}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Posição (opcional)">
          <Input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Ex: Atacante, Goleiro..."
          />
        </Field>
        <Field label={`Nota de habilidade: ${skill.toFixed(1)}`}>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={skill}
            onChange={(e) => setSkill(Number(e.target.value))}
            className="w-full accent-pitch-600"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-pitch-600"
          />
          Jogador ativo (entra nos sorteios)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
