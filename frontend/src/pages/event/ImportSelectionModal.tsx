import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, FileSpreadsheet, ListChecks } from "lucide-react";
import { api } from "../../api/client";
import type { NameMatchResult, NameMatchRow, Player } from "../../types";
import { Alert, Badge, Button, Checkbox, Modal, Segmented, Select, Textarea } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { FilePicker } from "../group/ImportPlayersModal";
import type { EventCtx } from "../EventPage";

const SAMPLE = `Pelada de quinta — confirmados
1. Neto ✅
2. Pedro Vital
3) Igor
- Cauã`;

const STATUS: Record<NameMatchRow["status"], { label: string; tone: "green" | "amber" | "brand" | "neutral" }> = {
  matched: { label: "encontrado", tone: "green" },
  similar: { label: "parecido", tone: "amber" },
  ambiguous: { label: "escolha um", tone: "amber" },
  not_found: { label: "não encontrado", tone: "brand" },
  duplicate: { label: "repetido", tone: "neutral" },
};

export function ImportSelectionModal({
  open,
  ctx,
  onClose,
  onApply,
}: {
  open: boolean;
  ctx: EventCtx;
  onClose: () => void;
  onApply: (playerIds: number[], replace: boolean) => void;
}) {
  const { group, players, isAdmin } = ctx;
  const [method, setMethod] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<NameMatchResult | null>(null);
  const [choice, setChoice] = useState<Record<number, number | "">>({}); // ambiguous rows
  const [create, setCreate] = useState<Record<number, boolean>>({}); // not-found rows
  const [replace, setReplace] = useState<"replace" | "add">("replace");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    setChoice({});
    setCreate({});
  }, [open]);

  async function analyze() {
    setError(null);
    const form = new FormData();
    if (method === "text") {
      if (!text.trim()) return setError("Cole a lista de nomes.");
      form.append("text", text);
    } else {
      if (!file) return setError("Selecione um arquivo.");
      form.append("file", file);
    }
    setBusy(true);
    try {
      const res = await api.postForm<NameMatchResult>(`/groups/${group.id}/players/match-names`, form);
      setResult(res);
      if (!res.rows.length) setError("Nenhum nome reconhecido.");
    } catch (err) {
      setError(errorMessage(err, "Falha ao ler a lista"));
    } finally {
      setBusy(false);
    }
  }

  const resolved = useMemo(() => {
    if (!result) return [] as number[];
    const ids = new Set<number>();
    result.rows.forEach((r, i) => {
      if ((r.status === "matched" || r.status === "similar") && r.player_id) ids.add(r.player_id);
      if (r.status === "ambiguous" && choice[i]) ids.add(choice[i] as number);
    });
    return [...ids];
  }, [result, choice]);

  const toCreate = result
    ? result.rows.map((r, i) => (r.status === "not_found" && create[i] ? r.input : null)).filter((x): x is string => !!x)
    : [];

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      let created: Player[] = [];
      if (toCreate.length) {
        const res = await api.post<{ players: Player[] }>(`/groups/${group.id}/players/bulk`, {
          players: toCreate.map((name) => ({ name })),
        });
        created = res.players;
        await ctx.reloadPlayers();
      }
      onApply([...resolved, ...created.map((p) => p.id)], replace === "replace");
    } catch (err) {
      setError(errorMessage(err, "Falha ao cadastrar os novos jogadores"));
    } finally {
      setBusy(false);
    }
  }

  const total = resolved.length + toCreate.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar jogadores selecionados"
      description="Cole a lista de confirmados (ex.: do WhatsApp): só os nomes importam — numeração, emojis e notas são ignorados."
      icon={ListChecks}
      size="lg"
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!result ? (
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
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={SAMPLE} className="font-mono" />
            ) : (
              <FilePicker
                file={file}
                onPick={setFile}
                inputRef={fileRef}
                hint={
                  <>
                    <strong>.txt</strong>: um nome por linha. <strong>.csv / .xls / .xlsx</strong>: coluna{" "}
                    <span className="font-mono">Nome</span> (ou a primeira coluna).
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
            <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-3 py-2">Na lista</th>
                    <th className="px-3 py-2">Jogador do grupo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line align-middle">
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-fg">{r.input}</span>
                          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {(r.status === "matched" || r.status === "similar" || r.status === "duplicate") && r.player_id ? (
                          <span className={r.status === "duplicate" ? "text-subtle" : "font-medium text-fg"}>
                            {byId.get(r.player_id)?.name ?? "—"}
                          </span>
                        ) : r.status === "ambiguous" ? (
                          <Select value={choice[i] ?? ""} onChange={(e) => setChoice({ ...choice, [i]: e.target.value ? Number(e.target.value) : "" })} className="h-9">
                            <option value="">Ignorar</option>
                            {r.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        ) : isAdmin ? (
                          <Checkbox
                            checked={!!create[i]}
                            onChange={(e) => setCreate({ ...create, [i]: e.target.checked })}
                            label="Cadastrar no grupo"
                          />
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                size="sm"
                value={replace}
                onChange={setReplace}
                options={[
                  { value: "replace", label: "Substituir seleção" },
                  { value: "add", label: "Adicionar à seleção" },
                ]}
              />
              <div className="flex gap-2">
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setResult(null)} disabled={busy}>
                  Voltar
                </Button>
                <Button onClick={apply} loading={busy} disabled={total === 0}>
                  Selecionar {total} jogador(es)
                </Button>
              </div>
            </div>
            {toCreate.length > 0 && (
              <p className="text-xs text-subtle">
                {toCreate.length} jogador(es) novo(s) serão cadastrados com a nota do meio da faixa do grupo.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
