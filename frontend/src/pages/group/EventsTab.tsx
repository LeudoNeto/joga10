import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CalendarPlus, ChevronRight, Plus } from "lucide-react";
import { api } from "../../api/client";
import type { EventItem } from "../../types";
import { Alert, Button, Card, EmptyState, Field, Input, Modal, Spinner } from "../../components/ui";
import { errorMessage } from "../../lib/format";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function DateBadge({ iso }: { iso: string }) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface-2/60">
      <span className="text-[10px] font-bold uppercase tracking-wide text-accent">{MONTHS[date.getMonth()]}</span>
      <span className="text-xl font-bold leading-none tabular text-fg">{String(d).padStart(2, "0")}</span>
      <span className="text-[10px] text-subtle">{WEEKDAYS[date.getDay()]}</span>
    </div>
  );
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

  useEffect(() => {
    api
      .get<EventItem[]>(`/groups/${groupId}/events`)
      .then(setEvents)
      .catch((err) => setError(errorMessage(err, "Falha ao carregar eventos")));
  }, [groupId]);

  if (events === null) return error ? <Alert>{error}</Alert> : <Spinner label="Carregando eventos..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{events.length} evento(s)</p>
        {isAdmin && (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Evento
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum evento criado"
          description={
            isAdmin
              ? "Crie um evento para sortear os times e registrar as partidas."
              : "Os administradores ainda não criaram eventos."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((ev) => (
            <button key={ev.id} onClick={() => navigate(`/events/${ev.id}`)} className="group text-left">
              <Card className="flex items-center gap-4 p-4 transition-all group-hover:border-brand-600/40 group-hover:shadow-pop">
                <DateBadge iso={ev.date} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-fg">{ev.title}</h3>
                  <p className="mt-0.5 text-sm text-muted">Times, partidas e estatísticas</p>
                </div>
                <ChevronRight size={18} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </Card>
            </button>
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
            navigate(`/events/${id}?tab=teams`);
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
      const ev = await api.post<{ id: number }>(`/groups/${groupId}/events`, { title, date });
      onCreated(ev.id);
    } catch (err) {
      setError(errorMessage(err, "Falha ao criar evento"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo evento" icon={CalendarPlus}>
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
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Criar evento
          </Button>
        </div>
      </form>
    </Modal>
  );
}
