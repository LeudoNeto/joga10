import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui";
import type { ReactNode } from "react";

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img
        src="/logojoga10.png"
        alt="Joga10"
        className="h-9 w-9 rounded-full object-contain"
      />
      <span className="text-lg font-black tracking-tight text-slate-800">
        Joga<span className="text-red-600">10</span>
      </span>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Brand />
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-500 sm:inline">
                {user.name}
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Sair
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
