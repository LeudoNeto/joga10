import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileUp,
  Minus,
  Plus,
  Search,
  Shuffle,
  Target,
  Trash2,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { api } from "../../api/client";
import type { DrawMode, Player, Team } from "../../types";
import { useConfirm, useToast } from "../../components/Feedback";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Segmented,
  Select,
  Switch,
  cx,
} from "../../components/ui";
import { cabeNasVagas } from "../../lib/balance";
import { MODE_LABELS, capacidades, drawTeams } from "../../lib/draw";
import { errorMessage, fmtSkill } from "../../lib/format";
import { MAX_TEAMS, TEAM_STYLES } from "../../lib/teams";
import type { EventCtx } from "../EventPage";
import { ImportSelectionModal } from "./ImportSelectionModal";

interface DrawSettings {
  mode: DrawMode;
  numTeams: number;
  useSubs: boolean;
  panelinha: boolean;
  pins: number[][];
  selected: number[] | null;
}

const MODE_HELP: Record<DrawMode, string> = {
  optimal: "Menor diferença possível entre os times (pode levar alguns segundos).",
  heuristic: "Instantâneo: a maior nota vai sempre para o time mais fraco. Quase sempre chega no ótimo.",
  random: "Ignora as notas: sorteio 100% aleatório.",
};

const storageKey = (eventId: number) => `joga10_draw_v1_${eventId}`;

function loadSettings(eventId: number): Partial<DrawSettings> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(eventId)) || "{}");
  } catch {
    return {};
  }
}

/** Keep pins coherent: k teams, only selected players, no repeats. */
function normalizePins(pins: number[][], k: number, selected: Set<number>) {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let j = 0; j < k; j++) {
    out.push((pins[j] ?? []).filter((id) => selected.has(id) && !seen.has(id) && (seen.add(id), true)));
  }
  return out;
}

export function DrawPanel({ ctx }: { ctx: EventCtx }) {
  const { event, players, teams } = ctx;
  const confirm = useConfirm();
  const toast = useToast();
  const saved = useMemo(() => loadSettings(event.id), [event.id]);
  const valid = useMemo(() => new Set(players.map((p) => p.id)), [players]);

  const [open, setOpen] = useState(teams.length === 0);
  const [mode, setMode] = useState<DrawMode>(saved.mode ?? "optimal");
  const [numTeams, setNumTeams] = useState(saved.numTeams ?? Math.max(2, teams.length));
  const [useSubs, setUseSubs] = useState(saved.useSubs ?? true);
  const [panelinha, setPanelinha] = useState(saved.panelinha ?? false);
  const [pins, setPins] = useState<number[][]>(saved.pins ?? []);
  const [selected, setSelected] = useState<Set<number>>(() => {
    const ids = saved.selected?.length
      ? saved.selected
      : teams.length
      ? teams.flatMap((t) => t.players.map((p) => p.id))
      : players.filter((p) => p.active).map((p) => p.id);
    return new Set(ids.filter((id) => valid.has(id)));
  });
  const [showList, setShowList] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(() => players.filter((p) => selected.has(p.id)), [players, selected]);
  const n = chosen.length;
  const maxTeams = Math.max(2, Math.min(MAX_TEAMS, n));
  const k = Math.min(Math.max(2, numTeams), maxTeams);
  const normalized = useMemo(() => normalizePins(pins, k, selected), [pins, k, selected]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(event.id),
        JSON.stringify({ mode, numTeams, useSubs, panelinha, pins: normalized, selected: [...selected] })
      );
    } catch {
      /* per-browser convenience only */
    }
  }, [event.id, mode, numTeams, useSubs, panelinha, normalized, selected]);

  function changeTeams(next: number) {
    const value = Math.min(Math.max(2, next), maxTeams);
    const released = pins.slice(value).flat().filter((id) => selected.has(id)).length;
    if (panelinha && released) toast(`${released} jogador(es) liberado(s) da panelinha: o número de times diminuiu`, { tone: "info" });
    setNumTeams(value);
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt"));
  }, [players, query]);

  const caps = n >= 2 ? capacidades(n, k) : [];
  const pinFeasible = !panelinha || cabeNasVagas(normalized.map((l) => l.length), caps);

  async function draw() {
    setError(null);
    if (n < k) return setError(`Selecione ao menos ${k} jogadores.`);
    if (!pinFeasible) return setError("Panelinha inviável: há mais jogadores fixados do que vagas.");
    if (teams.length) {
      const ok = await confirm({
        title: "Refazer o sorteio?",
        message: "Os times atuais serão substituídos. O histórico de partidas e as estatísticas dos jogadores são mantidos.",
        confirmLabel: "Sortear novamente",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const subs = useSubs && mode !== "random";
      const out = await drawTeams({
        players: chosen.map((p) => ({ id: p.id, name: p.name, skill: p.skill })),
        numTeams: k,
        mode,
        useSubstitutes: subs,
        pins: panelinha ? normalized : [],
      });
      const savedTeams = await api.put<Team[]>(`/events/${event.id}/teams`, {
        mode,
        proven: out.proven,
        use_substitutes: subs,
        teams: out.teams,
      });
      ctx.setTeams(savedTeams);
      ctx.setEvent({ ...event, draw_mode: mode, draw_proven: out.proven, use_substitutes: subs });
      setOpen(false);
      toast(
        out.proven
          ? `Times sorteados (${MODE_LABELS[mode]})`
          : "Times sorteados — otimalidade não provada no tempo limite; mostrando a melhor solução encontrada",
        { tone: out.proven ? "success" : "info" }
      );
    } catch (err) {
      setError(errorMessage(err, err instanceof Error ? err.message : "Falha ao sortear os times"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/10 text-accent">
            <Wand2 size={17} />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight text-fg">
              {teams.length ? "Refazer sorteio" : "Sortear times"}
            </span>
            <span className="block text-xs text-subtle">
              {n} jogador(es) selecionado(s) · {k} times · {MODE_LABELS[mode]}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cx("text-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-4 py-4 sm:px-5">
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-fg/90">Modo de balanceamento</span>
              <Segmented
                value={mode}
                onChange={setMode}
                className="w-full"
                options={[
                  { value: "optimal", label: "Ótimo", icon: Target },
                  { value: "heuristic", label: "Heurístico", icon: Zap },
                  { value: "random", label: "Aleatório", icon: Shuffle },
                ]}
              />
              <p className="text-xs text-subtle">{MODE_HELP[mode]}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-fg/90">Times</span>
              <div className="flex items-center gap-1.5">
                <IconButton icon={Minus} label="Menos times" variant="secondary" onClick={() => changeTeams(k - 1)} disabled={k <= 2} />
                <span className="w-10 text-center text-xl font-bold tabular text-fg">{k}</span>
                <IconButton icon={Plus} label="Mais times" variant="secondary" onClick={() => changeTeams(k + 1)} disabled={k >= maxTeams} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Switch
              checked={useSubs && mode !== "random"}
              disabled={mode === "random"}
              onChange={setUseSubs}
              label="Completar com suplentes"
              description="Se os jogadores não dividem igualmente, o time menor ganha um suplente com nota calculada para equilibrar."
            />
            <Switch
              checked={panelinha}
              onChange={setPanelinha}
              label="Panelinha"
              description="Fixe jogadores nos times: no mesmo time eles ficam juntos, em times diferentes ficam separados."
            />
          </div>

          {/* players taking part */}
          <div className="rounded-xl border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setShowList((s) => !s)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-fg"
              >
                <Users size={16} className="text-accent" />
                {n} de {players.length} jogadores selecionados
                <ChevronDown size={16} className={cx("text-subtle transition-transform", showList && "rotate-180")} />
              </button>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" icon={FileUp} onClick={() => setImporting(true)}>
                  Importar selecionados
                </Button>
                {showList && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(players.filter((p) => p.active).map((p) => p.id)))}>
                      Ativos
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Nenhum
                    </Button>
                  </>
                )}
              </div>
            </div>
            {showList && (
              <div className="space-y-2 border-t border-line p-3">
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-9 pl-9" />
                </div>
                <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((p) => {
                    const on = selected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p.id)}
                        className={cx(
                          "flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors",
                          on ? "border-brand-600/40 bg-brand-600/10" : "border-transparent hover:bg-surface-2"
                        )}
                      >
                        <span
                          className={cx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-white",
                            on ? "border-brand-600 bg-brand-600" : "border-line-strong"
                          )}
                        >
                          {on && <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
                        </span>
                        <Avatar name={p.name} src={p.photo_url} size={24} />
                        <span className={cx("min-w-0 flex-1 truncate", on ? "text-fg" : "text-muted")}>{p.name}</span>
                        {!p.active && <Badge>inativo</Badge>}
                        <span className="text-xs font-semibold tabular text-subtle">{fmtSkill(p.skill)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {panelinha && n >= 2 && (
            <PanelinhaEditor
              k={k}
              players={chosen}
              pins={normalized}
              caps={caps}
              onChange={setPins}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" icon={Wand2} onClick={draw} loading={busy} disabled={n < 2 || !pinFeasible}>
              {busy ? (mode === "optimal" ? "Calculando..." : "Sorteando...") : teams.length ? "Refazer sorteio" : "Sortear times"}
            </Button>
            {n < k && <span className="text-xs text-red-500">Selecione ao menos {k} jogadores.</span>}
          </div>
        </div>
      )}

      <ImportSelectionModal
        open={importing}
        ctx={ctx}
        onClose={() => setImporting(false)}
        onApply={(ids, replace) => {
          setSelected((prev) => new Set(replace ? ids : [...prev, ...ids]));
          setShowList(true);
          setImporting(false);
          toast(`${ids.length} jogador(es) selecionado(s) pela lista`);
        }}
      />
    </Card>
  );
}

function PanelinhaEditor({
  k,
  players,
  pins,
  caps,
  onChange,
}: {
  k: number;
  players: Player[];
  pins: number[][];
  caps: number[];
  onChange: (pins: number[][]) => void;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const size = Math.max(...caps); // ceil(n/k): final size of every team
  const counts = pins.map((l) => l.length);
  const feasible = cabeNasVagas(counts, caps);
  const used = new Set(pins.flat());
  const available = players.filter((p) => !used.has(p.id)).sort((a, b) => b.skill - a.skill);

  const update = (j: number, list: number[]) => onChange(pins.map((l, i) => (i === j ? list : l)));

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-2/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Adicione jogadores aos times para fixá-los. Os demais são distribuídos pelo algoritmo para equilibrar o que sobrar.
        </p>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(pins.map(() => []))} disabled={!used.size}>
          Limpar panelinhas
        </Button>
      </div>
      {!feasible && <Alert>Configuração inviável: há mais jogadores fixados do que vagas. Remova alguém ou aumente o número de times.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: k }, (_, j) => {
          const style = TEAM_STYLES[j % TEAM_STYLES.length];
          const attempt = counts.slice();
          attempt[j] += 1;
          const fits = cabeNasVagas(attempt, caps);
          return (
            <div key={j} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: style.color }} />
                  {style.name}
                </span>
                <span className="text-xs font-semibold tabular text-subtle">
                  {counts[j]} / {size}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {pins[j].map((id) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <Avatar name={p.name} src={p.photo_url} size={22} />
                      <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
                      <span className="text-xs font-semibold tabular text-subtle">{fmtSkill(p.skill)}</span>
                      <IconButton icon={X} label="Tirar da panelinha" size="sm" className="h-6 w-6" onClick={() => update(j, pins[j].filter((x) => x !== id))} />
                    </li>
                  );
                })}
                {Array.from({ length: Math.max(0, size - counts[j]) }, (_, v) => (
                  <li key={`v${v}`} className="px-3 py-1.5 text-center text-xs italic text-subtle/70">
                    vaga livre
                  </li>
                ))}
              </ul>
              <div className="border-t border-line p-2">
                <Select
                  value=""
                  disabled={!fits || !available.length}
                  onChange={(e) => e.target.value && update(j, [...pins[j], Number(e.target.value)])}
                  className="h-9"
                >
                  <option value="">
                    {!fits ? "Time completo" : !available.length ? "Todos já estão fixados" : "+ Adicionar jogador..."}
                  </option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtSkill(p.skill)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
