import { Link, useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Avatar, IconButton } from "./ui";

export function Brand() {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <img
        src="/logojoga10.png"
        alt=""
        className="h-9 w-9 rounded-full object-contain transition-transform group-hover:scale-105"
      />
      <span className="text-lg font-black tracking-tight text-fg">
        Joga<span className="text-brand-500">10</span>
      </span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      onClick={toggle}
      variant="ghost"
      className={className}
    />
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Brand />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {user && (
              <>
                <div className="ml-1 hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 py-1 pl-1 pr-3 sm:flex">
                  <Avatar name={user.name} size={28} />
                  <span className="max-w-[160px] truncate text-sm font-medium text-fg">{user.name}</span>
                </div>
                <IconButton
                  icon={LogOut}
                  label="Sair"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                />
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
