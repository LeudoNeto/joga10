import { useEffect, useState } from "react";
import { ArrowRightLeft, Flag, ListOrdered, Play, Shuffle, Swords } from "lucide-react";
import { api } from "../../api/client";
import type { FinishOptions, FinishResult, MatchDetail, NextMatchSuggestion, Staying, Team } from "../../types";
import { Alert, Button, Modal, Select, Spinner, cx } from "../../components/ui";
import { errorMessage } from "../../lib/format";

function TeamDot({ color }: { color: string | null }) {
  return <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color || "#dc2626" }} />;
}

export function FinishMatchModal({
  match,
  teams,
  onClose,
  onFinished,
  onStartNext,
  onChooseNext,
}: {
  match: MatchDetail;
  teams: Team[];
  onClose: () => void;
  onFinished: (result: FinishResult) => void;
  onStartNext: () => Promise<void>;
  onChooseNext: (suggestion: NextMatchSuggestion | null) => void;
}) {
  const [options, setOptions] = useState<FinishOptions | null>(null);
  const [staying, setStaying] = useState<Staying | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/events/${match.event_id}/matches/${match.id}`;

  useEffect(() => {
    api
      .get<FinishOptions>(`${base}/finish-options`)
      .then((o) => {
        setOptions(o);
        setStaying(o.default);
      })
      .catch((err) => setError(errorMessage(err, "Falha ao carregar as opções")));
  }, [base]);

  async function finish() {
    if (!staying) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<FinishResult>(`${base}/finish`, { staying });
      setResult(res);
      onFinished(res);
    } catch (err) {
      setError(errorMessage(err, "Falha ao finalizar"));
    } finally {
      setBusy(false);
    }
  }

  const name = (id: number) => teams.find((t) => t.id === id);
  const labels: Record<Staying, { title: string; detail: string }> = {
    a: { title: `${match.team_a.name} fica`, detail: `${match.team_b.name} sai` },
    b: { title: `${match.team_b.name} fica`, detail: `${match.team_a.name} sai` },
    none: { title: "Os dois saem", detail: "Entram os times há mais tempo sem jogar" },
    both: { title: "Os dois seguem", detail: "Só há dois times no evento" },
  };

  if (result) {
    const s = result.suggestion;
    const a = s ? name(s.team_a_id) : null;
    const b = s ? name(s.team_b_id) : null;
    return (
      <Modal open onClose={onClose} title="Partida finalizada" icon={Flag} description="E agora, qual a próxima partida?">
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {s && a && b ? (
            <div className="rounded-xl border border-line bg-surface-2/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Próxima partida sugerida</p>
              <div className="flex flex-wrap items-center gap-3 text-base font-bold text-fg">
                <span className="inline-flex items-center gap-2">
                  <TeamDot color={a.color} /> {a.name}
                </span>
                <span className="text-subtle">×</span>
                <span className="inline-flex items-center gap-2">
                  <TeamDot color={b.color} /> {b.name}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted">{s.reason}</p>
            </div>
          ) : (
            <Alert tone="info">Não há times suficientes para a próxima partida.</Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Agora não
            </Button>
            <Button variant="secondary" icon={ArrowRightLeft} onClick={() => onChooseNext(s)}>
              Escolher times
            </Button>
            <Button
              icon={Play}
              disabled={!s}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onStartNext();
                } catch (err) {
                  setError(errorMessage(err, "Falha ao iniciar a próxima partida"));
                  setBusy(false);
                }
              }}
            >
              Gerar próxima partida
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Finalizar partida"
      icon={Flag}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button icon={Flag} onClick={finish} loading={busy} disabled={!staying || !options}>
            Finalizar
          </Button>
        </>
      }
    >
      {error && <Alert className="mb-3">{error}</Alert>}
      {!options ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4 rounded-xl border border-line bg-surface-2/40 py-4">
            <span className="flex items-center gap-2 text-sm font-semibold text-fg">
              <TeamDot color={match.team_a.color} /> {match.team_a.name}
            </span>
            <span className="text-3xl font-black tabular text-fg">
              {options.score_a} <span className="text-subtle">×</span> {options.score_b}
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold text-fg">
              {match.team_b.name} <TeamDot color={match.team_b.color} />
            </span>
          </div>
          <Alert tone={options.winner ? "info" : "warning"}>{options.reason}</Alert>
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg/90">Quem fica em campo?</p>
            {options.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setStaying(opt)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                  staying === opt ? "border-brand-500 bg-brand-600/10" : "border-line hover:bg-surface-2"
                )}
              >
                <span
                  className={cx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    staying === opt ? "border-brand-500" : "border-line-strong"
                  )}
                >
                  {staying === opt && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">
                    {labels[opt].title}
                    {opt === options.default && <span className="ml-2 text-xs font-medium text-accent">sugerido pelas regras</span>}
                  </span>
                  <span className="block text-xs text-subtle">{labels[opt].detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ChooseTeamsModal({
  teams,
  suggestion,
  onClose,
  onStart,
}: {
  teams: Team[];
  suggestion: NextMatchSuggestion | null;
  onClose: () => void;
  onStart: (teamA: number, teamB: number) => Promise<void>;
}) {
  const playable = teams.filter((t) => t.players.length > 0);
  const [a, setA] = useState(String(suggestion?.team_a_id ?? playable[0]?.id ?? ""));
  const [b, setB] = useState(String(suggestion?.team_b_id ?? playable[1]?.id ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = a && b && a !== b;

  return (
    <Modal
      open
      onClose={onClose}
      title="Escolher os times da partida"
      icon={Swords}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={Play}
            disabled={!valid}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onStart(Number(a), Number(b));
              } catch (err) {
                setError(errorMessage(err, "Falha ao iniciar a partida"));
                setBusy(false);
              }
            }}
          >
            Iniciar partida
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <TeamSelect label="Time A" value={a} onChange={setA} teams={playable} />
          <span className="hidden pb-2.5 text-center text-lg font-bold text-subtle sm:block">×</span>
          <TeamSelect label="Time B" value={b} onChange={setB} teams={playable} />
        </div>
        {a && a === b && <p className="text-xs text-red-500">Escolha dois times diferentes.</p>}
        {suggestion && (
          <p className="flex items-start gap-1.5 text-xs text-subtle">
            <ListOrdered size={14} className="mt-px shrink-0" /> Sugestão automática: {suggestion.reason}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={Shuffle}
          onClick={() => {
            const pick = [...playable].sort(() => Math.random() - 0.5).slice(0, 2);
            if (pick.length === 2) {
              setA(String(pick[0].id));
              setB(String(pick[1].id));
            }
          }}
        >
          Sortear confronto
        </Button>
      </div>
    </Modal>
  );
}

function TeamSelect({
  label,
  value,
  onChange,
  teams,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  teams: Team[];
}) {
  const team = teams.find((t) => String(t.id) === value);
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-2 text-sm font-medium text-fg/90">
        {label}
        {team && <TeamDot color={team.color} />}
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Escolha...</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.players.length} jog.)
          </option>
        ))}
      </Select>
    </label>
  );
}
