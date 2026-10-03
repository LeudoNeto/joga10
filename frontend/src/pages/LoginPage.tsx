import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { AuthShell } from "../components/AuthShell";
import { Alert, Button, Field, Input } from "../components/ui";
import { errorMessage } from "../lib/format";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const isInvite = from.startsWith("/join/") || from.startsWith("/invite/");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Falha ao entrar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle={
        isInvite
          ? "Entre na sua conta para aceitar o convite e entrar no grupo"
          : "Entre para organizar suas peladas"
      }
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/signup" state={{ from }} className="font-semibold text-accent hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" icon={LogIn} loading={busy}>
          {isInvite ? "Entrar e ver convite" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
