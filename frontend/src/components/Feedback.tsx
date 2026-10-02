import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Button, Modal, cx } from "./ui";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastOptions {
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

type ToastFn = (message: ReactNode, options?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>(
    (message, { tone = "success", action, duration } = {}) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, message, tone, action }]);
      setTimeout(() => dismiss(id), duration ?? (action ? 6000 : 3200));
    },
    [dismiss]
  );

  const icons = { success: CircleCheck, error: CircleAlert, info: Info };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-md animate-toast-in items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg shadow-pop"
            >
              <Icon
                size={18}
                className={cx(
                  "shrink-0",
                  t.tone === "success" && "text-emerald-500",
                  t.tone === "error" && "text-red-500",
                  t.tone === "info" && "text-sky-500"
                )}
              />
              <div className="min-w-0 flex-1">{t.message}</div>
              {t.action && (
                <button
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent hover:bg-brand-600/10"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                aria-label="Fechar"
                className="shrink-0 rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-fg"
                onClick={() => dismiss(t.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de ToastProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Confirm dialog (promise based, replaces window.confirm)
// ---------------------------------------------------------------------------
interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    []
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={state !== null}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        icon={state?.danger ? TriangleAlert : Info}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button
              variant={state?.danger ? "danger" : "primary"}
              onClick={() => close(true)}
              autoFocus
            >
              {state?.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-muted">{state.message}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de ConfirmProvider");
  return ctx;
}
