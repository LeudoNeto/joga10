import type { ReactNode } from "react";
import { ThemeToggle } from "./Layout";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl"
      />
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logojoga10.png" alt="Joga10" className="h-20 w-20 object-contain drop-shadow-xl" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/90 p-6 shadow-pop backdrop-blur sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
