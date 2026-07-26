import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { EventItem } from "../../types";
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

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function EventsTab({
  groupId,
  isAdmin,
  onChange,
}: {
  groupId: number;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function load() {
    try {
      setEvents(await api.get<EventItem[]>(`/groups/${groupId}/events`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar eventos");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (events === null) return <Spinner label="Carregando eventos..." />;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{events.length} evento(s)</p>
        {isAdmin && <Button onClick={() => setCreating(true)}>+ Evento</Button>}
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="Nenhum evento criado"
          description={
            isAdmin
              ? "Crie um evento para sortear os times e registrar partidas."
              : "Os administradores ainda não criaram eventos."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((ev) => (
            <Card
              key={ev.id}
              className="cursor-pointer p-4 transition hover:border-pitch-400 hover:shadow-md"
              onClick={() => navigate(`/events/${ev.id}`)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{ev.title}</h3>
                <span className="text-sm text-slate-500">
                  {formatDate(ev.date)}
                </span>
              </div>
              <p className="mt-2 text-sm text-pitch-600">
                Abrir evento →
              </p>
            </Card>
          ))}
        </div>
      )}

      {isAdmin && (
        <CreateEventModal
          open={creating}
          groupId={groupId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onChange();
            navigate(`/events/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateEventModal({
  open,
  groupId,
  onClose,
  onCreated,
}: {
  open: boolean;
  groupId: number;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(today);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ev = await api.post<{ id: number }>(`/groups/${groupId}/events`, {
        title,
        date,
      });
      onCreated(ev.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar evento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo evento">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Título">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            placeholder="Ex: Pelada do dia 25/07/2026"
          />
        </Field>
        <Field label="Data">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Criando..." : "Criar evento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
