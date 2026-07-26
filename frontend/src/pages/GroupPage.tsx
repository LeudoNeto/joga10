import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { GroupDetail } from "../types";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  RoleBadge,
  Spinner,
  Textarea,
  cx,
} from "../components/ui";
import { PlayersTab } from "./group/PlayersTab";
import { EventsTab } from "./group/EventsTab";
import { InvitesTab } from "./group/InvitesTab";
import { MembersTab } from "./group/MembersTab";

type TabKey = "players" | "events" | "members" | "invites";

export function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("players");
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.get<GroupDetail>(`/groups/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao carregar grupo");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!detail) return <Spinner label="Carregando grupo..." />;

  const isAdmin = detail.role === "admin";

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "players", label: "Jogadores", show: true },
    { key: "events", label: "Eventos", show: true },
    { key: "members", label: "Membros", show: true },
    { key: "invites", label: "Convites", show: isAdmin },
  ];

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-slate-500 hover:text-pitch-600">
        ← Meus grupos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{detail.name}</h1>
            <RoleBadge role={detail.role} />
          </div>
          {detail.description && (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {detail.description}
            </p>
          )}
          <div className="mt-2 flex gap-4 text-sm text-slate-500">
            <span>👥 {detail.member_count}</span>
            <span>🎽 {detail.player_count}</span>
            <span>📅 {detail.event_count}</span>
          </div>
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={() => setShowSettings(true)}>
            Configurações
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition",
                tab === t.key
                  ? "border-pitch-600 text-pitch-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div>
        {tab === "players" && <PlayersTab groupId={id} isAdmin={isAdmin} />}
        {tab === "events" && (
          <EventsTab groupId={id} isAdmin={isAdmin} onChange={load} />
        )}
        {tab === "members" && <MembersTab members={detail.members} />}
        {tab === "invites" && isAdmin && <InvitesTab groupId={id} />}
      </div>

      {isAdmin && (
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          detail={detail}
          onSaved={() => {
            setShowSettings(false);
            load();
          }}
          onDeleted={() => navigate("/")}
        />
      )}
    </div>
  );
}

function SettingsModal({
  open,
  onClose,
  detail,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  detail: GroupDetail;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(detail.name);
    setDescription(detail.description || "");
  }, [detail, open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/groups/${detail.id}`, { name, description });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Excluir este grupo? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/groups/${detail.id}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Configurações do grupo">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="danger" onClick={remove} disabled={busy}>
            Excluir grupo
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              Salvar
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          <Badge color="slate">Somente admin</Badge> Apenas o criador pode
          excluir o grupo.
        </p>
      </div>
    </Modal>
  );
}
