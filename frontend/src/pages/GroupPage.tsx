import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  Link2,
  Settings,
  Shirt,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import type { GroupDetail, Player } from "../types";
import { useConfirm } from "../components/Feedback";
import { Alert, Button, Field, Input, Modal, RoleBadge, Spinner, Tabs, Textarea } from "../components/ui";
import { errorMessage, fmtSkill, plural } from "../lib/format";
import { PlayersTab } from "./group/PlayersTab";
import { EventsTab } from "./group/EventsTab";
import { InvitesTab } from "./group/InvitesTab";
import { MembersTab } from "./group/MembersTab";

type TabKey = "players" | "events" | "members" | "invites";

export function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const tab = (params.get("tab") as TabKey) || "players";
  const setTab = (key: TabKey) => setParams({ tab: key }, { replace: true });

  const load = useCallback(async () => {
    try {
      setDetail(await api.get<GroupDetail>(`/groups/${id}`));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar grupo"));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!detail) return <Spinner label="Carregando grupo..." />;

  const isAdmin = detail.role === "admin";

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} /> Meus grupos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{detail.name}</h1>
            <RoleBadge role={detail.role} />
          </div>
          {detail.description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{detail.description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users size={15} /> {plural(detail.member_count, "membro", "membros")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shirt size={15} /> {plural(detail.player_count, "jogador", "jogadores")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} /> {plural(detail.event_count, "evento", "eventos")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={15} /> Notas de {fmtSkill(detail.min_skill)} a {fmtSkill(detail.max_skill)}
            </span>
          </div>
        </div>
        {isAdmin && (
          <Button variant="secondary" icon={Settings} onClick={() => setShowSettings(true)}>
            Configurações
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "players", label: "Jogadores", icon: Shirt, count: detail.player_count },
          { key: "events", label: "Eventos", icon: CalendarDays, count: detail.event_count },
          { key: "members", label: "Membros", icon: Users, count: detail.member_count },
          ...(isAdmin ? [{ key: "invites" as TabKey, label: "Convites", icon: Link2 }] : []),
        ]}
      />

      <div>
        {tab === "players" && <PlayersTab group={detail} onChange={load} />}
        {tab === "events" && <EventsTab groupId={id} isAdmin={isAdmin} onChange={load} />}
        {tab === "members" && <MembersTab group={detail} onChange={setDetail} />}
        {tab === "invites" && isAdmin && <InvitesTab groupId={id} />}
      </div>

      {isAdmin && (
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          detail={detail}
          onSaved={(d) => {
            setShowSettings(false);
            setDetail(d);
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
  onSaved: (detail: GroupDetail) => void;
  onDeleted: () => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description || "");
  const [minSkill, setMinSkill] = useState(String(detail.min_skill));
  const [maxSkill, setMaxSkill] = useState(String(detail.max_skill));
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(detail.name);
    setDescription(detail.description || "");
    setMinSkill(String(detail.min_skill));
    setMaxSkill(String(detail.max_skill));
    setError(null);
    api.get<Player[]>(`/groups/${detail.id}/players`).then(setPlayers).catch(() => setPlayers([]));
  }, [detail, open]);

  const min = Number(minSkill.replace(",", "."));
  const max = Number(maxSkill.replace(",", "."));
  const rangeValid = minSkill !== "" && maxSkill !== "" && Number.isFinite(min) && Number.isFinite(max) && min < max;
  const outside = useMemo(
    () => (rangeValid ? players.filter((p) => p.skill < min || p.skill > max).length : 0),
    [players, min, max, rangeValid]
  );

  async function save() {
    if (!rangeValid) {
      setError("A nota mínima deve ser menor que a nota máxima.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api.patch<GroupDetail>(`/groups/${detail.id}`, {
          name,
          description,
          min_skill: min,
          max_skill: max,
        })
      );
    } catch (err) {
      setError(errorMessage(err, "Falha ao salvar"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Excluir grupo?",
      message: "Todos os jogadores, eventos, times e estatísticas do grupo serão apagados. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir grupo",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/groups/${detail.id}`);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Falha ao excluir"));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configurações do grupo"
      icon={Settings}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>
            Excluir grupo
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={busy}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-fg/90">Faixa de notas dos jogadores</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="text-xs text-muted">Nota mínima</span>}>
              <Input type="number" step="0.01" min={0} max={100} value={minSkill} onChange={(e) => setMinSkill(e.target.value)} />
            </Field>
            <Field label={<span className="text-xs text-muted">Nota máxima</span>}>
              <Input type="number" step="0.01" min={0} max={100} value={maxSkill} onChange={(e) => setMaxSkill(e.target.value)} />
            </Field>
          </div>
          {rangeValid && outside > 0 && (
            <Alert tone="warning" className="mt-3">
              {outside} jogador(es) estão fora da nova faixa e terão a nota ajustada para o limite mais próximo.
            </Alert>
          )}
        </div>
        <p className="text-xs text-subtle">Apenas o criador pode excluir o grupo.</p>
      </div>
    </Modal>
  );
}
