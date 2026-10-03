import { useEffect, useState } from "react";
import { Crown, Shirt, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Feedback";
import { Avatar, Badge, Card, RoleBadge, ROLE_LABELS, Select } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import type { GroupDetail, Member, Player, Role } from "../../types";

const ROLE_HELP: { role: Role; icon: typeof Crown; text: string }[] = [
  { role: "admin", icon: Crown, text: "gerencia tudo: jogadores, eventos, times, partidas e convites" },
  { role: "moderator", icon: ShieldCheck, text: "registra gols e assistências, conduz as partidas e altera fotos e posições" },
  { role: "member", icon: UserRound, text: "acompanha tudo, somente leitura" },
];

export function MembersTab({ group, onChange }: { group: GroupDetail; onChange: (detail: GroupDetail) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const isAdmin = group.role === "admin";
  // Admins and moderators may change which player each member is.
  const isStaff = isAdmin || group.role === "moderator";

  useEffect(() => {
    if (!isStaff) return;
    api.get<Player[]>(`/groups/${group.id}/players`).then(setPlayers).catch(() => setPlayers([]));
  }, [group.id, isStaff]);

  async function changeRole(userId: number, role: Role) {
    setBusy(userId);
    try {
      onChange(await api.patch<GroupDetail>(`/groups/${group.id}/members/${userId}`, { role }));
      toast(`Papel alterado para ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast(errorMessage(err, "Falha ao alterar o papel"), { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function changePlayer(member: Member, playerId: number | null) {
    setBusy(member.user_id);
    try {
      onChange(
        await api.put<GroupDetail>(`/groups/${group.id}/members/${member.user_id}/player`, { player_id: playerId })
      );
      const name = players.find((p) => p.id === playerId)?.name;
      toast(name ? `${member.name} agora é ${name}` : `Jogador de ${member.name} removido`);
    } catch (err) {
      toast(errorMessage(err, "Falha ao alterar o jogador"), { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  // player id -> member who claimed it (a player belongs to a single member)
  const owners = new Map(group.members.filter((m) => m.player_id != null).map((m) => [m.player_id!, m.name]));

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line overflow-hidden">
        {group.members.map((m) => {
          const editable = isAdmin && !m.is_creator && m.user_id !== user?.id;
          return (
            <div key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={m.name} src={m.player_photo_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium text-fg">
                  <span className="truncate">{m.name}</span>
                  {m.is_creator && <Badge>criador</Badge>}
                  {m.user_id === user?.id && <Badge>você</Badge>}
                </p>
                <p className="truncate text-xs text-subtle">{m.email}</p>
                {!isStaff && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                    <Shirt size={12} className="shrink-0" />
                    {m.player_name ?? <span className="italic text-subtle">jogador não definido</span>}
                  </p>
                )}
              </div>
              {isStaff && (
                <div className="w-full sm:w-48">
                  <Select
                    value={m.player_id ?? ""}
                    disabled={busy === m.user_id}
                    onChange={(e) => changePlayer(m, e.target.value ? Number(e.target.value) : null)}
                    aria-label={`Jogador de ${m.name}`}
                  >
                    <option value="">— sem jogador —</option>
                    {m.player_id != null && !players.some((p) => p.id === m.player_id) && (
                      <option value={m.player_id}>{m.player_name}</option>
                    )}
                    {players.map((p) => {
                      const owner = owners.get(p.id);
                      const taken = owner !== undefined && p.id !== m.player_id;
                      return (
                        <option key={p.id} value={p.id} disabled={taken}>
                          {p.name}
                          {taken ? ` (${owner})` : ""}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              )}
              {editable ? (
                <div className="w-40">
                  <Select
                    value={m.role}
                    disabled={busy === m.user_id}
                    onChange={(e) => changeRole(m.user_id, e.target.value as Role)}
                    aria-label={`Papel de ${m.name}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderador</option>
                    <option value="member">Membro</option>
                  </Select>
                </div>
              ) : (
                <RoleBadge role={m.role} />
              )}
            </div>
          );
        })}
      </Card>
      <div className="grid gap-2 sm:grid-cols-3">
        {ROLE_HELP.map(({ role, icon: Icon, text }) => (
          <div key={role} className="flex gap-2.5 rounded-xl border border-line bg-surface/50 p-3 text-xs text-muted">
            <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <strong className="text-fg">{ROLE_LABELS[role]}</strong>: {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
