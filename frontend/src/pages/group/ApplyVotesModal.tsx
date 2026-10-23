import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, SlidersHorizontal, Undo2, Users } from "lucide-react";
import { api } from "../../api/client";
import type { GroupDetail, Player, VoteSummary, VoteSummaryRow } from "../../types";
import { Alert, Avatar, Badge, Button, Input, Modal, Segmented, Spinner, cx } from "../../components/ui";
import { errorMessage, fmtSkill, plural } from "../../lib/format";
import { sameSkill } from "../../lib/votes";

/** vote: accept the vote average · keep: current nota · edit: typed by the admin */
type Choice = "vote" | "keep" | "edit";
type RowState = { choice: Choice; manual: string };

const hasSuggestion = (r: VoteSummaryRow) => r.vote_skill !== null && !sameSkill(r.vote_skill, r.skill);
const round2 = (v: number) => Math.round(v * 100) / 100;

function parseSkill(text: string) {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : NaN;
}

/** Admin review of the voting: for each player, accept the vote average
 * (suggested), refuse it (keep the current nota) or type another nota. */
export function ApplyVotesModal({
  open,
  group,
  onClose,
  onApplied,
}: {
  open: boolean;
  group: GroupDetail;
  onClose: () => void;
  onApplied: (updated: number) => void;
}) {
  const [summary, setSummary] = useState<VoteSummary | null>(null);
  const [state, setState] = useState<Record<number, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSummary(null);
    setError(null);
    api
      .get<VoteSummary>(`/groups/${group.id}/votes/summary`)
      .then((s) => {
        setSummary(s);
        setState(
          Object.fromEntries(
            s.players.map((r) => [r.player_id, { choice: hasSuggestion(r) ? "vote" : "keep", manual: "" }])
          )
        );
      })
      .catch((err) => setError(errorMessage(err, "Falha ao carregar a votação")));
  }, [open, group.id]);

  // Suggested changes first, then the rest (both by name, as sent by the server).
  const [suggested, others] = useMemo(
    () => [summary?.players.filter(hasSuggestion) ?? [], summary?.players.filter((r) => !hasSuggestion(r)) ?? []],
    [summary]
  );

  const { min_skill: min, max_skill: max } = group;
  function target(r: VoteSummaryRow) {
    const s = state[r.player_id];
    if (s?.choice === "vote" && r.vote_skill !== null) return r.vote_skill;
    if (s?.choice === "edit") return parseSkill(s.manual);
    return r.skill;
  }
  const all = [...suggested, ...others];
  const invalid = all.filter((r) => {
    const t = target(r);
    return !Number.isFinite(t) || t < min || t > max;
  });
  const changes = all.filter((r) => Number.isFinite(target(r)) && !sameSkill(target(r), r.skill));

  function choose(r: VoteSummaryRow, choice: Choice) {
    const current = state[r.player_id];
    if (current?.choice === choice) return;
    // Editing starts from the nota shown until now.
    const manual = choice === "edit" ? String(round2(target(r))).replace(".", ",") : current?.manual ?? "";
    setState((s) => ({ ...s, [r.player_id]: { choice, manual } }));
  }

  function chooseAll(choice: "vote" | "keep") {
    setState(Object.fromEntries(all.map((r) => [r.player_id, { choice: hasSuggestion(r) ? choice : "keep", manual: "" }])));
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await api.post<Player[]>(`/groups/${group.id}/votes/apply`, {
        updates: changes.map((r) => ({ player_id: r.player_id, skill: round2(target(r)) })),
      });
      onApplied(changes.length);
    } catch (err) {
      setError(errorMessage(err, "Falha ao atualizar as notas"));
    } finally {
      setBusy(false);
    }
  }

  function rowsOf(list: VoteSummaryRow[], title: string) {
    if (!list.length) return null;
    return (
      <>
        <p className="bg-surface-2/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          {title} ({list.length})
        </p>
        {list.map((r) => (
          <ApplyRow
            key={r.player_id}
            row={r}
            state={state[r.player_id] ?? { choice: "keep", manual: "" }}
            target={target(r)}
            invalid={invalid.includes(r)}
            group={group}
            onChoose={(choice) => choose(r, choice)}
            onManual={(manual) => setState((s) => ({ ...s, [r.player_id]: { choice: "edit", manual } }))}
          />
        ))}
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={SlidersHorizontal}
      title="Atualizar notas pela votação"
      description="Compare a nota atual de cada jogador com a média dos votos dos membros. A média é sugerida como nova nota: aceite, recuse (mantém a atual) ou defina outra nota."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={Check}
            onClick={apply}
            loading={busy}
            disabled={!summary || changes.length === 0 || invalid.length > 0}
          >
            {changes.length ? `Atualizar ${plural(changes.length, "nota", "notas")}` : "Nada a atualizar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!summary ? (
          !error && <Spinner label="Carregando votação..." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue" icon={Users}>
                  {plural(summary.voters, "membro votou", "membros votaram")}
                </Badge>
                <Badge tone="brand">{plural(suggested.length, "sugestão", "sugestões")} de mudança</Badge>
              </div>
              {suggested.length > 0 && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" icon={Check} onClick={() => chooseAll("vote")}>
                    Aceitar todas
                  </Button>
                  <Button size="sm" variant="ghost" icon={Undo2} onClick={() => chooseAll("keep")}>
                    Recusar todas
                  </Button>
                </div>
              )}
            </div>
            {summary.voters === 0 && (
              <Alert tone="info">
                Ainda não há votos neste grupo. Os membros votam pelo botão <strong>Votação</strong> na aba Jogadores.
              </Alert>
            )}
            {invalid.length > 0 && (
              <Alert>
                As notas devem estar entre {fmtSkill(min)} e {fmtSkill(max)}.
              </Alert>
            )}
            {all.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nenhum jogador cadastrado.</p>
            ) : (
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {rowsOf(suggested, "Sugestões da votação")}
                {rowsOf(others, "Sem sugestão de mudança")}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ApplyRow({
  row: r,
  state,
  target,
  invalid,
  group,
  onChoose,
  onManual,
}: {
  row: VoteSummaryRow;
  state: RowState;
  target: number;
  invalid: boolean;
  group: GroupDetail;
  onChoose: (choice: Choice) => void;
  onManual: (value: string) => void;
}) {
  const suggestion = hasSuggestion(r);
  const changed = Number.isFinite(target) && !sameSkill(target, r.skill);
  const delta = r.vote_skill !== null ? r.vote_skill - r.skill : 0;
  return (
    <div className={cx("space-y-2 px-3 py-2.5 transition-colors", changed && "bg-brand-600/[0.06]")}>
      <div className="flex items-center gap-3">
        <Avatar name={r.name} src={r.photo_url} size={36} className={r.active ? "" : "opacity-50 grayscale"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <span className="truncate">{r.name}</span>
            {!r.active && <Badge>inativo</Badge>}
          </p>
          <p className="truncate text-xs text-subtle">
            {r.vote_count ? plural(r.vote_count, "voto", "votos") : "sem votos"}
            {r.unknown_count > 0 && ` · ${r.unknown_count} não ${r.unknown_count === 1 ? "sabe" : "sabem"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-4 text-right">
          <Stat label="Atual">{fmtSkill(r.skill)}</Stat>
          <Stat label="Votação">
            {r.vote_skill === null ? (
              <span className="text-subtle">—</span>
            ) : (
              <>
                {fmtSkill(r.vote_skill)}
                {suggestion && (
                  <span
                    className={cx(
                      "ml-1 text-[11px] font-semibold",
                      delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {delta > 0 ? "+" : "−"}
                    {fmtSkill(Math.abs(delta))}
                  </span>
                )}
              </>
            )}
          </Stat>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        <Segmented<Choice>
          size="sm"
          value={state.choice}
          onChange={onChoose}
          options={
            suggestion
              ? [
                  { value: "vote", label: "Aceitar" },
                  { value: "keep", label: "Recusar" },
                  { value: "edit", label: "Editar" },
                ]
              : [
                  { value: "keep", label: "Manter" },
                  { value: "edit", label: "Editar" },
                ]
          }
        />
        {state.choice === "edit" && (
          <Input
            type="text"
            inputMode="decimal"
            value={state.manual}
            onChange={(e) => onManual(e.target.value)}
            aria-label={`Nova nota de ${r.name}`}
            title={`De ${fmtSkill(group.min_skill)} a ${fmtSkill(group.max_skill)}`}
            autoFocus
            className={cx(
              "!h-8 !w-20 text-right tabular",
              invalid && "!border-red-500 focus:!ring-red-500/20"
            )}
          />
        )}
        {changed && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs tabular">
            <span className="text-subtle line-through">{fmtSkill(r.skill)}</span>
            <ArrowRight size={12} className="text-subtle" />
            <span className="font-semibold text-fg">{fmtSkill(target)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className="text-sm font-bold tabular text-fg">{children}</p>
    </div>
  );
}
