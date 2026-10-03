import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { AuthShell } from "../components/AuthShell";
import { Alert, Button, Field, Input } from "../components/ui";
import { errorMessage } from "../lib/format";

export function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const isInvite = from.startsWith("/join/") || from.startsWith("/invite/");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setBusy(true);
    try {
      await signup(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Falha ao criar conta"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Criar sua conta"
      subtitle={
        isInvite
          ? "Cadastre-se para aceitar o convite e entrar no grupo"
          : "Comece a gerenciar seus grupos esportivos"
      }
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" state={{ from }} className="font-semibold text-accent hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            autoComplete="name"
            placeholder="Seu nome"
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
        </Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" icon={UserPlus} loading={busy}>
          {isInvite ? "Criar conta e ver convite" : "Criar conta"}
        </Button>
      </form>
    </AuthShell>
  );
}
