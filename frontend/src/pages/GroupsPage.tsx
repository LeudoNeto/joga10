import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, Link2, Plus, Shirt, Users, UsersRound } from "lucide-react";
import { api } from "../api/client";
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
import { errorMessage } from "../lib/format";

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

  useEffect(() => {
    api
      .get<GroupSummary[]>("/groups")
      .then(setGroups)
      .catch((err) => setError(errorMessage(err, "Falha ao carregar grupos")));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">Meus grupos</h1>
          <p className="mt-1 text-sm text-muted">Gerencie suas peladas e grupos esportivos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Link2} onClick={() => setShowJoin(true)}>
            Entrar com convite
          </Button>
          <Button icon={Plus} onClick={() => setShowCreate(true)}>
            Novo grupo
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {groups === null ? (
        !error && <Spinner label="Carregando grupos..." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Você ainda não participa de nenhum grupo"
          description="Crie um grupo novo ou entre em um usando um link de convite."
          action={
            <Button icon={Plus} onClick={() => setShowCreate(true)}>
              Criar meu primeiro grupo
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-brand-600/40 group-hover:shadow-pop">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-fg">{g.name}</h2>
                  <RoleBadge role={g.role} />
                </div>
                {g.description && <p className="mb-4 line-clamp-2 text-sm text-muted">{g.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <div className="flex gap-4 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5" title="Membros">
                      <Users size={15} /> {g.member_count}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Jogadores">
                      <Shirt size={15} /> {g.player_count}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Eventos">
                      <CalendarDays size={15} /> {g.event_count}
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
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
      <JoinModal open={showJoin} onClose={() => setShowJoin(false)} onGo={(token) => navigate(`/join/${token}`)} />
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
      const group = await api.post<{ id: number }>("/groups", { name, description: description || null });
      onCreated(group.id);
    } catch (err) {
      setError(errorMessage(err, "Falha ao criar grupo"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo grupo" icon={UsersRound}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome do grupo">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex: Pelada de quinta" />
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
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Criar grupo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function JoinModal({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Entrar com convite" icon={Link2}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onGo(extractToken(value));
        }}
        className="space-y-4"
      >
        <Field label="Link ou código do convite" hint="Cole o link completo que você recebeu ou apenas o código.">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
            placeholder="https://.../join/abc123 ou abc123"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Continuar</Button>
        </div>
      </form>
    </Modal>
  );
}
