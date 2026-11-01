import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, FileSpreadsheet, FileUp } from "lucide-react";
import { api } from "../../api/client";
import type { RankingRow, StatImportMode, StatImportRow } from "../../types";
import { Alert, Badge, Button, Modal, Segmented, Textarea, cx } from "../../components/ui";
import { errorMessage, plural } from "../../lib/format";
import { FilePicker } from "../group/ImportPlayersModal";
import type { EventCtx } from "../EventPage";
import { ListHeader, MatchSelect, RowBadge, countPicks, rowStates, sortedRoster } from "./nameMatch";

const SAMPLE = `Pelada de quinta — estatísticas
1. Neto - 3 - 1
2. Pedro Vital - 1 - 2
Igor 2 0
Cauã - 1`;

const MODES: Record<StatImportMode, { label: string; help: string }> = {
  update: { label: "Atualizar listados", help: "Os jogadores da lista ficam com estes números; os demais não mudam." },
  add: { label: "Somar", help: "Os números da lista são somados aos que cada jogador já tem." },
  replace: {
    label: "Substituir tudo",
    help: "As estatísticas do evento passam a ser só as da lista: quem não está nela fica zerado.",
  },
};

/** Goals and assists of an event without matches, from a pasted list or a
 * file (staff: the roles that edit other players' stats). */
export function ImportStatsModal({
  open,
  ctx,
  onClose,
  onImported,
}: {
  open: boolean;
  ctx: EventCtx;
  onClose: () => void;
  onImported: (ranking: RankingRow[], players: number) => void;
}) {
  const { event, players } = ctx;
  const [method, setMethod] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<StatImportRow[] | null>(null);
  const [picks, setPicks] = useState<(number | null)[]>([]); // player chosen for each row
  const [mode, setMode] = useState<StatImportMode>("update");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    setPicks([]);
  }, [open]);

  async function analyze() {
    setError(null);
    const form = new FormData();
    if (method === "text") {
      if (!text.trim()) return setError('Cole a lista no formato "Nome - Gols - Assistências".');
      form.append("text", text);
    } else {
      if (!file) return setError("Selecione um arquivo .txt, .csv, .xls ou .xlsx.");
      form.append("file", file);
    }
    setBusy(true);
    try {
      const res = await api.postForm<{ rows: StatImportRow[] }>(`/events/${event.id}/stats/import`, form);
      setRows(res.rows);
      setPicks(res.rows.map((r) => (r.error ? null : r.player_id)));
      if (!res.rows.length) setError("Nenhuma linha reconhecida.");
    } catch (err) {
      setError(errorMessage(err, "Falha ao ler a lista"));
    } finally {
      setBusy(false);
    }
  }

  const roster = useMemo(() => sortedRoster(players), [players]);
  const states = useMemo(
    () => rowStates((rows ?? []).map((r) => ({ status: r.status ?? "not_found", player_id: r.player_id })), picks),
    [rows, picks]
  );
  const pickCount = useMemo(() => countPicks(picks), [picks]);

  // A player listed twice keeps the first line.
  const stats = (rows ?? []).flatMap((r, i) => {
    const id = picks[i];
    return !r.error && id != null && states[i] !== "duplicate"
      ? [{ player_id: id, goals: r.goals, assists: r.assists }]
      : [];
  });
  const leftOut = (rows?.length ?? 0) - stats.length;

  const pick = (row: number, id: number | null) => setPicks((prev) => prev.map((v, i) => (i === row ? id : v)));

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const ranking = await api.post<RankingRow[]>(`/events/${event.id}/stats/bulk`, { mode, stats });
      onImported(ranking, stats.length);
    } catch (err) {
      setError(errorMessage(err, "Falha ao importar as estatísticas"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar estatísticas"
      description="Gols e assistências de cada jogador, colados de uma lista (ex.: do WhatsApp) ou de um arquivo. Numeração e emojis são ignorados."
      icon={FileUp}
      size="lg"
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!rows ? (
          <>
            <Segmented
              value={method}
              onChange={setMethod}
              className="w-full"
              options={[
                { value: "text", label: "Colar lista", icon: ClipboardPaste },
                { value: "file", label: "Arquivo", icon: FileSpreadsheet },
              ]}
            />
            {method === "text" ? (
              <div className="space-y-1.5">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={SAMPLE} className="font-mono" />
                <p className="text-xs text-subtle">
                  Uma linha por jogador: <span className="font-mono">Nome - Gols - Assistências</span> (assistências opcionais).
                </p>
              </div>
            ) : (
              <FilePicker
                file={file}
                onPick={setFile}
                inputRef={fileRef}
                hint={
                  <>
                    <strong>.txt</strong>: linhas <span className="font-mono">Nome - Gols - Assistências</span>.{" "}
                    <strong>.csv / .xls / .xlsx</strong>: colunas <span className="font-mono">Nome</span>,{" "}
                    <span className="font-mono">Gols</span> e <span className="font-mono">Assistências</span> (ou nessa ordem).
                  </>
                }
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={analyze} loading={busy}>
                Analisar lista
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
              <ListHeader />
              <ul className="divide-y divide-line">
                {rows.map((r, i) => (
                  <li key={i} className="grid gap-2 px-3 py-2.5 sm:grid-cols-2 sm:items-center sm:gap-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cx("min-w-0 break-words text-sm", r.error ? "text-subtle" : "text-fg")}>
                        {r.input || "—"}
                      </span>
                      {r.error ? <Badge>ignorada</Badge> : <RowBadge state={states[i]} />}
                      {!r.error && (
                        <span
                          className="ml-auto whitespace-nowrap text-xs font-semibold tabular text-fg"
                          title={`${plural(r.goals, "gol", "gols")}, ${plural(r.assists, "assistência", "assistências")}`}
                        >
                          {r.goals} G · {r.assists} A
                        </span>
                      )}
                    </div>
                    {r.error ? (
                      <p className="text-xs text-subtle">{r.error}</p>
                    ) : (
                      <MatchSelect
                        name={r.input}
                        candidates={r.candidates}
                        value={picks[i] ?? null}
                        roster={roster}
                        pickCount={pickCount}
                        onChange={(id) => pick(i, id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {leftOut > 0 && (
              <p className="text-xs text-subtle">
                {plural(leftOut, "linha fica", "linhas ficam")} de fora: sem jogador escolhido, repetida ou não entendida.
              </p>
            )}

            <div className="space-y-1.5">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={(Object.keys(MODES) as StatImportMode[]).map((value) => ({ value, label: MODES[value].label }))}
              />
              <p className="text-xs text-subtle">{MODES[mode].help}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setRows(null)} disabled={busy}>
                Voltar
              </Button>
              <Button onClick={apply} loading={busy} disabled={stats.length === 0}>
                Importar {plural(stats.length, "jogador", "jogadores")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
