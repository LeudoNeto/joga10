import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { GroupSummary } from "../types";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  RoleBadge,
  Spinner,
  Textarea,
} from "../components/ui";

function extractToken(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/join\/([^/?#]+)/);
  return match ? match[1] : trimmed;
}

export function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const navigate = useNavigate();

  async function load() {
    try {
      setGroups(await api.get<GroupSummary[]>("/groups"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar grupos");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meus grupos</h1>
          <p className="text-sm text-slate-500">
            Gerencie suas peladas e grupos esportivos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowJoin(true)}>
            Entrar com convite
          </Button>
          <Button onClick={() => setShowCreate(true)}>+ Novo grupo</Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {groups === null ? (
        <Spinner label="Carregando grupos..." />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Você ainda não participa de nenhum grupo"
          description="Crie um grupo novo ou entre em um usando um link de convite."
          action={
            <Button className="mt-2" onClick={() => setShowCreate(true)}>
              Criar meu primeiro grupo
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`}>
              <Card className="h-full p-5 transition hover:border-pitch-400 hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">
                    {g.name}
                  </h2>
                  <RoleBadge role={g.role} />
                </div>
                {g.description && (
                  <p className="mb-4 line-clamp-2 text-sm text-slate-500">
                    {g.description}
                  </p>
                )}
                <div className="flex gap-4 text-sm text-slate-500">
                  <span>👥 {g.member_count} membros</span>
                  <span>🎽 {g.player_count} jogadores</span>
                  <span>📅 {g.event_count} eventos</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/groups/${id}`)}
      />
      <JoinModal
        open={showJoin}
        onClose={() => setShowJoin(false)}
        onGo={(token) => navigate(`/join/${token}`)}
      />
    </div>
  );
}

function CreateGroupModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const group = await api.post<{ id: number }>("/groups", {
        name,
        description: description || null,
      });
      onCreated(group.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar grupo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo grupo">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome do grupo">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="Ex: Pelada de quinta"
          />
        </Field>
        <Field label="Descrição (opcional)">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Local, horário, regras..."
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Criando..." : "Criar grupo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function JoinModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  onGo: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Entrar com convite">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onGo(extractToken(value));
        }}
        className="space-y-4"
      >
        <Field
          label="Link ou código do convite"
          hint="Cole o link completo que você recebeu ou apenas o código."
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
            placeholder="https://.../join/abc123 ou abc123"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Continuar</Button>
        </div>
      </form>
    </Modal>
  );
}
