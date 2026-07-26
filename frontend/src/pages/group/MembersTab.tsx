import type { Member } from "../../types";
import { Card, RoleBadge } from "../../components/ui";

export function MembersTab({ members }: { members: Member[] }) {
  return (
    <Card className="divide-y divide-slate-100">
      {members.map((m) => (
        <div
          key={m.user_id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="font-medium text-slate-800">{m.name}</p>
            <p className="text-xs text-slate-500">{m.email}</p>
          </div>
          <RoleBadge role={m.role} />
        </div>
      ))}
    </Card>
  );
}
