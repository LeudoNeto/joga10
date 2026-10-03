import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Crown,
  Info,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-900/30 hover:bg-brand-500 active:bg-brand-700",
  secondary:
    "border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3",
  outline:
    "border border-brand-600/40 text-accent hover:border-brand-600/70 hover:bg-brand-600/10",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger:
    "border border-red-500/25 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-5 text-base",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconRight: IconRight,
    loading,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref
) {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle size={iconSize} className="animate-spin" />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={2.25} />
      )}
      {children}
      {IconRight && !loading && <IconRight size={iconSize} strokeWidth={2.25} />}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  label: string;
  variant?: Variant;
  size?: Size;
}) {
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-xl" : "h-10 w-10 rounded-xl";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        box,
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <Icon size={size === "sm" ? 15 : 18} strokeWidth={2.1} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const controlBase =
  "w-full rounded-xl border border-line bg-surface-2/60 text-sm text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx(controlBase, "h-10 px-3", className)} {...props} />;
  }
);

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, "px-3 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx(controlBase, "h-10 cursor-pointer appearance-none pl-3 pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle"
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-fg/90">{label}</span>
      {children}
      {hint && <span className="block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer select-none items-start gap-2.5 text-sm text-fg",
        props.disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-brand-600"
        {...props}
      />
      {(label || description) && (
        <span className="leading-tight">
          {label}
          {description && <span className="mt-0.5 block text-xs text-subtle">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "group inline-flex items-start gap-3 rounded-lg text-left disabled:cursor-not-allowed disabled:opacity-50",
        focusRing
      )}
    >
      <span
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-surface-3"
        )}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
      <span className="text-sm leading-tight text-fg">
        {label}
        {description && <span className="mt-0.5 block text-xs text-subtle">{description}</span>}
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: LucideIcon; disabled?: boolean }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      className={cx(
        "inline-flex rounded-xl border border-line bg-surface-2/60 p-1",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-surface text-fg shadow-sm ring-1 ring-line dark:bg-surface-3 dark:ring-0"
                : "text-muted hover:text-fg",
              focusRing
            )}
          >
            {Icon && <Icon size={14} strokeWidth={2.25} className={active ? "text-accent" : ""} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces & feedback
// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-accent">
            <Icon size={17} strokeWidth={2.25} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="text-xs text-subtle">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "green" | "amber" | "blue" | "violet";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-3/70 text-muted",
  brand: "bg-brand-600/10 text-accent ring-1 ring-inset ring-brand-600/20",
  green: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-400",
  blue: "bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-500/20 dark:text-violet-300",
};

export function Badge({
  children,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        toneClasses[tone],
        className
      )}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  moderator: "Moderador",
  member: "Membro",
};

export function RoleBadge({ role }: { role: Role }) {
  if (role === "admin")
    return (
      <Badge tone="brand" icon={Crown}>
        {ROLE_LABELS.admin}
      </Badge>
    );
  if (role === "moderator")
    return (
      <Badge tone="violet" icon={ShieldCheck}>
        {ROLE_LABELS.moderator}
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={UserRound}>
      {ROLE_LABELS.member}
    </Badge>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex items-center justify-center gap-3 py-12 text-muted", className)}>
      <LoaderCircle size={20} className="animate-spin text-accent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Alert({
  children,
  tone = "error",
  className,
}: {
  children: ReactNode;
  tone?: "error" | "info" | "success" | "warning";
  className?: string;
}) {
  const map = {
    error: ["border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300", CircleAlert],
    info: ["border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300", Info],
    success: ["border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", CircleCheck],
    warning: ["border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", TriangleAlert],
  } as const;
  const [classes, Icon] = map[tone];
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm", classes, className)}>
      <Icon size={17} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong/70 bg-surface/40 px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
          <Icon size={22} />
        </span>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
let activeModalCount = 0;
let originalBodyOverflow: string | null = null;

export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);

    if (activeModalCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalCount++;

    return () => {
      window.removeEventListener("keydown", onKey);
      activeModalCount = Math.max(0, activeModalCount - 1);
      if (activeModalCount === 0) {
        document.body.style.overflow = originalBodyOverflow ?? "";
        originalBodyOverflow = null;
      }
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative z-10 flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl",
          width
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-accent">
                <Icon size={18} strokeWidth={2.25} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-fg">{title}</h3>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          <IconButton icon={X} label="Fechar" size="sm" onClick={onClose} className="-mr-1" />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { key: T; label: string; icon?: LucideIcon; count?: number }[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.key === value;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cx(
                "relative -mb-px inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active ? "text-fg" : "text-subtle hover:text-fg",
                focusRing,
                "rounded-t-lg"
              )}
            >
              {Icon && <Icon size={16} className={active ? "text-accent" : ""} />}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cx(
                    "rounded-full px-1.5 text-[11px] font-bold tabular",
                    active ? "bg-brand-600/15 text-accent" : "bg-surface-2 text-subtle"
                  )}
                >
                  {t.count}
                </span>
              )}
              <span
                className={cx(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors",
                  active ? "bg-brand-500" : "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  "bg-rose-500/20 text-rose-600 dark:text-rose-300",
  "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  "bg-teal-500/20 text-teal-700 dark:text-teal-300",
  "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-orange-500/20 text-orange-700 dark:text-orange-300",
];

export function initials(name: string) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : parts[0][1] ?? "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
  ring,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  ring?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.36)),
    ...(ring ? { boxShadow: `0 0 0 2px rgb(var(--surface)), 0 0 0 3.5px ${ring}` } : {}),
  };
  if (src && !failed)
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={style}
        className={cx("shrink-0 rounded-full bg-surface-2 object-cover", className)}
      />
    );
  return (
    <span
      style={style}
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight",
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------
export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  color?: string | null; // team colour dot
}

export function Menu({
  trigger,
  items,
  header,
  align = "right",
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean }) => ReactNode;
  items: MenuItem[];
  header?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {open && (
        <div
          className={cx(
            "absolute z-30 mt-1.5 min-w-[200px] animate-pop-in rounded-xl border border-line bg-surface p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {header && (
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {header}
            </p>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  item.danger
                    ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    : "text-fg hover:bg-surface-2"
                )}
              >
                {item.color && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                )}
                {Icon && <Icon size={15} className={item.danger ? "" : "text-subtle"} />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small stat tile
// ---------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface-2/50 px-3 py-2", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular text-fg">{value}</div>
    </div>
  );
}
