import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, MailOpen } from "lucide-react";
import { api } from "../api/client";
import type { InvitePreview } from "../types";
import { Alert, Button, Card, RoleBadge, Spinner } from "../components/ui";
import { errorMessage } from "../lib/format";

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<InvitePreview>(`/invites/${token}`)
      .then(setPreview)
      .catch((err) => setError(errorMessage(err, "Convite inválido")));
  }, [token]);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ group_id: number }>(`/invites/${token}/accept`);
      navigate(`/groups/${res.group_id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Falha ao entrar no grupo"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !preview)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={() => navigate("/")}>
          Voltar aos meus grupos
        </Button>
      </div>
    );

  if (!preview) return <Spinner label="Verificando convite..." />;

  return (
    <div className="mx-auto max-w-md pt-6">
      <Card className="p-6 text-center sm:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10 text-accent">
          <MailOpen size={22} />
        </span>
        <p className="mt-4 text-sm text-muted">Você foi convidado para</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">{preview.group_name}</h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
          <span>Papel neste grupo:</span>
          <RoleBadge role={preview.role} />
        </div>

        {error && <Alert className="mt-4 text-left">{error}</Alert>}

        {preview.already_member ? (
          <div className="mt-6 space-y-3">
            <Alert tone="info" className="text-left">
              Você já faz parte deste grupo.
            </Alert>
            <Button className="w-full" iconRight={ArrowRight} onClick={() => navigate(`/groups/${preview.group_id}`)}>
              Ir para o grupo
            </Button>
          </div>
        ) : preview.valid ? (
          <div className="mt-6 space-y-2">
            <Button className="w-full" size="lg" onClick={accept} loading={busy}>
              Aceitar convite e entrar
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>
              Agora não
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <Alert className="text-left">{preview.reason || "Este convite não é válido."}</Alert>
            <Button variant="secondary" className="w-full" onClick={() => navigate("/")}>
              Voltar
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
