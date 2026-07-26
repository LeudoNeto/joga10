import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert, Button, Field, Input } from "../components/ui";
import { ApiError } from "../api/client";

export function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

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
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar conta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-4 flex justify-center">
          <img
            src="/logojoga10.png"
            alt="Joga10"
            className="h-24 w-24 object-contain"
          />
        </div>
        <h1 className="mb-1 text-center text-xl font-bold text-slate-800">
          Criar sua conta
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Comece a gerenciar seus grupos esportivos
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Seu nome"
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@exemplo.com"
            />
          </Field>
          <Field label="Senha" hint="Mínimo de 6 caracteres">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Criando..." : "Criar conta"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold text-pitch-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
