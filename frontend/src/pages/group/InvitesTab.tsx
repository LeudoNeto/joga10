import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Invite, Role } from "../../types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  RoleBadge,
  Select,
  Spinner,
} from "../../components/ui";

function inviteUrl(token: string) {
  return `${window.location.origin}/join/${token}`;
}

export function InvitesTab({ groupId }: { groupId: number }) {
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
      setError(err instanceof ApiError ? err.message : "Falha ao carregar convites");
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
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao gerar convite");
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

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Gerar novo convite
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Papel concedido">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Membro (somente leitura)</option>
              <option value="admin">Admin (pode gerenciar)</option>
            </Select>
          </Field>
          <Field label="Máx. de usos" hint="Vazio = ilimitado">
            <Input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Ilimitado"
            />
          </Field>
          <Field label="Expira em (dias)" hint="Vazio = sem expiração">
            <Input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="Nunca"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={create} disabled={busy}>
            {busy ? "Gerando..." : "Gerar link de convite"}
          </Button>
        </div>
      </Card>

      {invites === null ? (
        <Spinner label="Carregando convites..." />
      ) : invites.length === 0 ? (
        <EmptyState title="Nenhum convite gerado ainda" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {invites.map((inv) => (
            <div key={inv.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RoleBadge role={inv.role} />
                  {inv.active ? (
                    <Badge color="green">Ativo</Badge>
                  ) : (
                    <Badge color="red">Revogado</Badge>
                  )}
                  <span className="text-xs text-slate-400">
                    {inv.uses} uso(s)
                    {inv.max_uses ? ` / ${inv.max_uses}` : ""}
                    {inv.expires_at
                      ? ` · expira ${new Date(inv.expires_at).toLocaleDateString("pt-BR")}`
                      : ""}
                  </span>
                </div>
                {inv.active && (
                  <Button variant="ghost" onClick={() => revoke(inv.id)}>
                    Revogar
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrl(inv.token)} className="text-xs" />
                <Button variant="secondary" onClick={() => copy(inv.token)}>
                  {copied === inv.token ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
