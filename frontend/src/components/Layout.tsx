import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { PasswordModal } from "./PasswordModal";
import { Avatar, IconButton, Menu } from "./ui";

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
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Brand />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {user && (
              <>
                <Menu
                  header={user.name}
                  items={[{ label: "Alterar senha", icon: KeyRound, onClick: () => setChangingPassword(true) }]}
                  trigger={(props) => (
                    <button
                      type="button"
                      {...props}
                      aria-label="Menu do usuário"
                      className="ml-1 flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 p-1 transition-colors hover:border-line-strong hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 sm:pr-2.5"
                    >
                      <Avatar name={user.name} size={28} />
                      <span className="hidden max-w-[160px] truncate text-sm font-medium text-fg sm:inline">{user.name}</span>
                      <ChevronDown size={14} className="hidden text-subtle sm:block" />
                    </button>
                  )}
                />
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
      <PasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}
