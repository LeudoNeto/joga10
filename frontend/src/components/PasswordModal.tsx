import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../api/client";
import { errorMessage } from "../lib/format";
import { useToast } from "./Feedback";
import { Alert, Button, Field, Input, Modal } from "./ui";

/** Changes the logged user's password (confirming the current one) or, for a
 * group admin, the password of a `member` of that group. */
export function PasswordModal({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member?: { groupId: number; userId: number; name: string };
}) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setNext("");
    setRepeat("");
    setError(null);
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) return setError("A nova senha deve ter ao menos 6 caracteres");
    if (next !== repeat) return setError("A confirmação não confere com a nova senha");
    setBusy(true);
    setError(null);
    try {
      if (member) {
        await api.put(`/groups/${member.groupId}/members/${member.userId}/password`, { new_password: next });
        toast(`Senha de ${member.name} alterada`);
      } else {
        await api.put("/auth/password", { current_password: current, new_password: next });
        toast("Senha alterada");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Falha ao alterar a senha"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={KeyRound}
      size="sm"
      title={member ? `Alterar senha de ${member.name}` : "Alterar senha"}
      description={member && "A senha atual deixa de funcionar. Passe a nova senha para a pessoa."}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!member && (
          <Field label="Senha atual">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </Field>
        )}
        <Field label="Nova senha" hint="Mínimo de 6 caracteres">
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            maxLength={128}
            required
            autoFocus={!!member}
          />
        </Field>
        <Field label="Confirmar nova senha">
          <Input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            maxLength={128}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icon={KeyRound} loading={busy}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Modal>
  );
}
