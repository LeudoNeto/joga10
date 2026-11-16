import { useState, type CSSProperties, type ReactNode } from "react";
import { ChartColumn, ChevronLeft, ChevronRight, CircleQuestionMark, Table2, type LucideIcon } from "lucide-react";
import { Avatar, Button, Card, IconButton, Modal, SectionTitle, Select, cx } from "../../components/ui";
import { fmtSkill, plural } from "../../lib/format";
import { bucketize, pct, type Coverage } from "../../lib/voteStats";

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------
type Align = "start" | "center" | "end";

/** Hover/focus tooltip of a mark: the value leads, the label follows. */
export function Tip({
  value,
  label,
  align = "center",
  className,
  style,
  children,
}: {
  value: ReactNode;
  label?: ReactNode;
  align?: Align;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={cx("group/tip relative", className)} style={style}>
      {children}
      <div
        role="tooltip"
        className={cx(
          "pointer-events-none absolute bottom-full z-20 mb-1.5 hidden w-max max-w-[220px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left shadow-pop group-focus-within/tip:block group-hover/tip:block",
          align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
        )}
      >
        <p className="text-sm font-semibold text-fg">{value}</p>
        {label && <p className="text-xs text-muted">{label}</p>}
      </div>
    </div>
  );
}

/** A chart in a card, with an optional table view (the accessible twin). */
export function ChartCard({
  title,
  description,
  icon,
  actions,
  table,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  table?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cx("space-y-4 p-4 sm:p-5", className)}>
      <SectionTitle
        icon={icon}
        title={title}
        description={description}
        actions={
          (actions || table) && (
            <>
              {actions}
              {table && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={showTable ? ChartColumn : Table2}
                  onClick={() => setShowTable((v) => !v)}
                >
                  {showTable ? "Gráfico" : "Tabela"}
                </Button>
              )}
            </>
          )
        }
      />
      {showTable && table ? table : children}
    </Card>
  );
}

export function Legend({ items }: { items: { label: string; mark: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {item.mark}
          {item.label}
        </span>
      ))}
    </div>
  );
}

export const Swatch = ({ className }: { className: string }) => (
  <span aria-hidden className={cx("h-2.5 w-2.5 shrink-0 rounded-sm", className)} />
);

const FILL = {
  score: "bg-viz-score",
  unknown: "bg-viz-unknown",
  missing: "bg-surface-3",
};

export const COVERAGE_LEGEND = [
  { label: "Com nota", mark: <Swatch className={FILL.score} /> },
  { label: "Não sei", mark: <Swatch className={FILL.unknown} /> },
  { label: "Sem voto", mark: <Swatch className={cx(FILL.missing, "ring-1 ring-inset ring-line-strong")} /> },
];

/** Select with previous/next buttons, to step through players or voters. */
export function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: { id: number; label: string; group?: string }[];
  onChange: (id: number) => void;
}) {
  const at = options.findIndex((o) => o.id === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const render = (list: typeof options) =>
    list.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
      </option>
    ));
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:max-w-md sm:flex-1">
      <IconButton
        icon={ChevronLeft}
        label="Anterior"
        variant="secondary"
        disabled={at <= 0}
        onClick={() => onChange(options[at - 1].id)}
      />
      <div className="min-w-0 flex-1">
        <Select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
          {groups.length === 1
            ? render(options)
            : groups.map((g) => (
                <optgroup key={g} label={g || label}>
                  {render(options.filter((o) => (o.group ?? "") === g))}
                </optgroup>
              ))}
        </Select>
      </div>
      <IconButton
        icon={ChevronRight}
        label="Próximo"
        variant="secondary"
        disabled={at < 0 || at >= options.length - 1}
        onClick={() => onChange(options[at + 1].id)}
      />
    </div>
  );
}

/** A person (voter or player) opened from a chart: big photo and name. */
export function PersonModal({
  person,
  onClose,
}: {
  person: { name: string; photo: string | null; description?: ReactNode; action?: ReactNode } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={person?.name ?? ""}
      description={person?.description}
      size="sm"
      footer={person?.action}
    >
      {person &&
        (person.photo ? (
          <img
            src={person.photo}
            alt={person.name}
            className="aspect-square w-full rounded-xl bg-surface-2 object-cover"
          />
        ) : (
          <div className="flex justify-center py-6">
            <Avatar name={person.name} size={160} />
          </div>
        ))}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Segmented bar: one whole (expected votes) split into nota / Não sei / none
// ---------------------------------------------------------------------------
export function CoverageBar({ coverage: c, tall, label }: { coverage: Coverage; tall?: boolean; label?: string }) {
  const parts = [
    { key: "score", name: "Com nota", value: c.score, fill: FILL.score, ink: "text-white" },
    { key: "unknown", name: "Não sei", value: c.unknown, fill: FILL.unknown, ink: "text-zinc-900" },
    { key: "missing", name: "Sem voto", value: c.missing, fill: FILL.missing, ink: "text-fg" },
  ].filter((p) => p.value > 0);
  const height = tall ? "h-7" : "h-2";
  if (!parts.length) return <div className={cx("rounded-full bg-surface-3", height)} />;
  const summary = parts.map((p) => `${p.name}: ${p.value} (${pct(p.value, c.total)}%)`).join(", ");
  return (
    <div role="img" aria-label={label ? `${label}. ${summary}` : summary} className={cx("flex w-full gap-0.5", height)}>
      {parts.map((p, i) => {
        const share = pct(p.value, c.total);
        return (
          <Tip
            key={p.key}
            value={`${p.value} (${share}%)`}
            label={p.name}
            align={i === 0 ? "start" : i === parts.length - 1 ? "end" : "center"}
            className="h-full min-w-[3px]"
            style={{ flex: `${p.value} 1 0%` }}
          >
            <div
              tabIndex={tall ? 0 : undefined}
              className={cx(
                "flex h-full items-center overflow-visible whitespace-nowrap px-2 text-xs font-semibold tabular outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-brand-500/60",
                p.fill,
                p.ink,
                tall ? "rounded" : cx(i === 0 && "rounded-l-full", i === parts.length - 1 && "rounded-r-full")
              )}
            >
              {/* Printed only where it fits; hover and the legend carry the rest. */}
              {tall && share >= 12 && `${share}%`}
            </div>
          </Tip>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histogram: X = nota (the voting buttons), Y = how many; optional photos
// ---------------------------------------------------------------------------
export interface Unit {
  key: string;
  name: string;
  photo: string | null;
  value: number | null; // nota; null: "Não sei"
}

const PLOT = 140; // px, bars without photos
const UNIT = 24; // px per person when the photos are shown (20px avatar + gap)

export function NotaHistogram({
  options,
  units,
  photos,
  noun,
  listNames = true,
  onUnit,
}: {
  options: number[];
  units: Unit[];
  photos: boolean;
  noun: [string, string]; // e.g. ["voto", "votos"]
  listNames?: boolean; // name the units of a column in its tooltip
  onUnit?: (unit: Unit) => void;
}) {
  const scored = units.filter((u) => u.value !== null);
  const unknown = units.filter((u) => u.value === null);
  const columns = [
    ...bucketize(scored, (u) => u.value as number, options).map((list, i) => ({
      key: String(options[i]),
      title: `Nota ${fmtSkill(options[i])}`,
      label: fmtSkill(options[i]) as ReactNode,
      list,
      unknown: false,
    })),
    ...(unknown.length
      ? [
          {
            key: "unknown",
            title: "Não sei",
            label: <CircleQuestionMark size={12} className="mx-auto" aria-label="Não sei" />,
            list: unknown,
            unknown: true,
          },
        ]
      : []),
  ];
  const most = Math.max(1, ...columns.map((c) => c.list.length));
  const plot = photos ? Math.max(PLOT, most * UNIT) : PLOT;
  const total = units.length;
  const names = (list: Unit[]) =>
    list.length > 6 ? `${list.slice(0, 6).map((u) => u.name).join(", ")} e mais ${list.length - 6}` : list.map((u) => u.name).join(", ");
  const column = (unknown: boolean) => cx("min-w-[22px] flex-1", unknown && "ml-2");

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-0.5" style={{ height: plot + 20 }}>
        {columns.map((c, i) => {
          const n = c.list.length;
          const height = photos ? n * UNIT : Math.round((n / most) * plot);
          return (
            <Tip
              key={c.key}
              value={`${plural(n, noun[0], noun[1])} (${pct(n, total)}%)`}
              label={n && listNames ? `${c.title}: ${names(c.list)}` : c.title}
              align={i < 2 ? "start" : i >= columns.length - 2 ? "end" : "center"}
              className={cx(column(c.unknown), "flex h-full flex-col items-center justify-end")}
            >
              {n > 0 && <span className="mb-1 text-[11px] font-semibold tabular text-fg">{n}</span>}
              <div
                tabIndex={!photos && n ? 0 : undefined}
                aria-label={`${c.title}: ${plural(n, noun[0], noun[1])}`}
                className={cx(
                  "flex w-full flex-col-reverse items-center rounded-t outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand-500/60",
                  photos
                    ? cx("max-w-[26px] gap-1", n > 0 && "pb-0.5", c.unknown ? "bg-viz-unknown/25" : "bg-viz-score/20")
                    : cx("max-w-6 hover:opacity-85", c.unknown ? FILL.unknown : FILL.score)
                )}
                style={{ height }}
              >
                {photos &&
                  c.list.map((u) => (
                    <button
                      key={u.key}
                      type="button"
                      onClick={() => onUnit?.(u)}
                      title={u.name}
                      aria-label={`${u.name}: ${u.value === null ? "não sei" : `nota ${fmtSkill(u.value)}`}`}
                      className="flex shrink-0 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    >
                      <Avatar name={u.name} src={u.photo} size={20} />
                    </button>
                  ))}
              </div>
            </Tip>
          );
        })}
      </div>
      <div className="-mt-3 flex gap-0.5 border-t border-line pt-1">
        {columns.map((c) => (
          <span key={c.key} className={cx(column(c.unknown), "text-center text-[11px] tabular text-subtle")}>
            {c.label}
          </span>
        ))}
      </div>
      {unknown.length > 0 && (
        <Legend
          items={[
            { label: "Nota", mark: <Swatch className={FILL.score} /> },
            { label: "Não sei", mark: <Swatch className={FILL.unknown} /> },
          ]}
        />
      )}
    </div>
  );
}

/** Table view of a histogram: one row per nota with any vote. */
export function HistogramTable({ options, values, noun }: { options: number[]; values: (number | null)[]; noun: string }) {
  const scored = values.filter((v): v is number => v !== null);
  const rows = bucketize(scored, (v) => v, options)
    .map((list, i) => ({ label: `Nota ${fmtSkill(options[i])}`, n: list.length }))
    .filter((r) => r.n > 0);
  const unknown = values.length - scored.length;
  if (unknown) rows.push({ label: "Não sei", n: unknown });
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-subtle">
          <tr>
            <th className="px-3 py-2">Nota</th>
            <th className="px-3 py-2 text-right">{noun}</th>
            <th className="px-3 py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="px-3 py-1.5 text-fg">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular text-fg">{r.n}</td>
              <td className="px-3 py-1.5 text-right tabular text-muted">{pct(r.n, values.length)}%</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-muted">
                Nenhum voto.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Positions on the nota scale: votes, average, current nota
// ---------------------------------------------------------------------------
const MarkVote = () => <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-viz-score" />;
const MarkMean = () => <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-fg" />;
const MarkCurrent = () => (
  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border-2 border-muted bg-surface" />
);

export const SCALE_LEGEND = {
  vote: { label: "Voto", mark: <MarkVote /> },
  mean: { label: "Média da votação", mark: <MarkMean /> },
  current: { label: "Nota atual", mark: <MarkCurrent /> },
};

/** Every vote of a player on the group scale, with the average and the
 * current nota: shows at a glance how far apart the votes are. */
export function RangeStrip({
  min,
  max,
  values,
  mean,
  current,
  compact,
}: {
  min: number;
  max: number;
  values: number[];
  mean: number | null;
  current?: number;
  compact?: boolean; // no scale labels (rows of a list)
}) {
  const x = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  const low = values.length ? Math.min(...values) : null;
  const high = values.length ? Math.max(...values) : null;
  return (
    <div>
      <div className="relative mx-1.5 h-7">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
        {low !== null && high !== null && high > low && (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-viz-score/25"
            style={{ left: x(low), width: `${((high - low) / (max - min || 1)) * 100}%` }}
          />
        )}
        {values.map((v, i) => (
          <span
            key={i}
            title={`Voto: ${fmtSkill(v)}`}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-viz-score ring-2 ring-surface"
            style={{ left: x(v) }}
          />
        ))}
        {current !== undefined && (
          <span
            title={`Nota atual: ${fmtSkill(current)}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-muted bg-surface"
            style={{ left: x(current) }}
          />
        )}
        {mean !== null && (
          <span
            title={`Média da votação: ${fmtSkill(mean)}`}
            className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-surface"
            style={{ left: x(mean) }}
          />
        )}
      </div>
      {!compact && (
        <div className="flex justify-between text-[11px] tabular text-subtle">
          <span>{fmtSkill(min)}</span>
          <span>{fmtSkill(max)}</span>
        </div>
      )}
    </div>
  );
}

/** Before -> after on the nota scale: current nota to the vote average. */
export function Dumbbell({ min, max, from, to }: { min: number; max: number; from: number; to: number }) {
  const x = (v: number) => ((v - min) / (max - min || 1)) * 100;
  const [a, b] = [Math.min(x(from), x(to)), Math.max(x(from), x(to))];
  return (
    <div className="relative mx-1.5 h-5" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-muted/50" style={{ left: `${a}%`, width: `${b - a}%` }} />
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-muted bg-surface"
        style={{ left: `${x(from)}%` }}
      />
      <span
        className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-surface"
        style={{ left: `${x(to)}%` }}
      />
    </div>
  );
}

/** A voter's nota for a player as a bar on the scale, with a tick at the
 * others' average for comparison. */
export function NotaBar({
  min,
  max,
  value,
  reference,
}: {
  min: number;
  max: number;
  value: number;
  reference?: number;
}) {
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
  return (
    <div className="relative h-4" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-3" />
      <div
        className="absolute left-0 top-1/2 h-2 min-w-[4px] -translate-y-1/2 rounded-r bg-viz-score"
        style={{ width: x(value) }}
      />
      {reference !== undefined && (
        <span
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-surface"
          style={{ left: x(reference) }}
        />
      )}
    </div>
  );
}
