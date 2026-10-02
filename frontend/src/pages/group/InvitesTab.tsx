import { useEffect, useState } from "react";
import { Check, Copy, Link2, Plus } from "lucide-react";
import { api } from "../../api/client";
import type { Invite, Role } from "../../types";
import { useToast } from "../../components/Feedback";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  RoleBadge,
  SectionTitle,
  Select,
  Spinner,
} from "../../components/ui";
import { errorMessage } from "../../lib/format";

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

export function InvitesTab({ groupId }: { groupId: number }) {
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [maxUses, setMaxUses] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    try {
      setInvites(await api.get<Invite[]>(`/groups/${groupId}/invites`));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar convites"));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/groups/${groupId}/invites`, {
        role,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_in_days: expiresDays ? Number(expiresDays) : null,
      });
      setMaxUses("");
      setExpiresDays("");
      toast("Convite gerado");
      load();
    } catch (err) {
      setError(errorMessage(err, "Falha ao gerar convite"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    await api.del(`/groups/${groupId}/invites/${id}`);
    load();
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard may be blocked; the link is visible anyway */
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}

      <Card className="space-y-4 p-4 sm:p-5">
        <SectionTitle icon={Link2} title="Gerar novo convite" description="Quem abrir o link entra no grupo com o papel escolhido." />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Papel concedido">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Membro (somente leitura)</option>
              <option value="moderator">Moderador (estatísticas, fotos e posições)</option>
              <option value="admin">Admin (pode gerenciar)</option>
            </Select>
          </Field>
          <Field label="Máx. de usos" hint="Vazio = ilimitado">
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Ilimitado" />
          </Field>
          <Field label="Expira em (dias)" hint="Vazio = sem expiração">
            <Input type="number" min={1} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="Nunca" />
          </Field>
        </div>
        <Button icon={Plus} onClick={create} loading={busy}>
          Gerar link de convite
        </Button>
      </Card>

      {invites === null ? (
        <Spinner label="Carregando convites..." />
      ) : invites.length === 0 ? (
        <EmptyState icon={Link2} title="Nenhum convite gerado ainda" />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {invites.map((inv) => (
            <div key={inv.id} className="space-y-2.5 px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role={inv.role} />
                  {inv.active ? <Badge tone="green">Ativo</Badge> : <Badge>Revogado</Badge>}
                  <span className="text-xs text-subtle">
                    {inv.uses} uso(s)
                    {inv.max_uses ? ` / ${inv.max_uses}` : ""}
                    {inv.expires_at ? ` · expira ${new Date(inv.expires_at).toLocaleDateString("pt-BR")}` : ""}
                  </span>
                </div>
                {inv.active && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(inv.id)}>
                    Revogar
                  </Button>
                )}
              </div>
              {inv.active && (
                <div className="flex items-center gap-2">
                  <Input readOnly value={inviteUrl(inv.token)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <IconButton
                    icon={copied === inv.token ? Check : Copy}
                    label={copied === inv.token ? "Copiado!" : "Copiar link"}
                    variant="secondary"
                    onClick={() => copy(inv.token)}
                  />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
