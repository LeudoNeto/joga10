import { useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  EyeOff,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  Upload,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../api/client";
import type { BulkResult, GroupDetail, ImportAction, ImportPreview, ParsedPlayerRow } from "../../types";
import { Alert, Badge, Button, Modal, Segmented, Textarea, cx } from "../../components/ui";
import { errorMessage, fmtSkill } from "../../lib/format";

const SECTIONS: Record<ImportAction, { label: string; icon: LucideIcon }> = {
  update: { label: "Atualizar nota", icon: RefreshCw },
  create: { label: "Adicionar", icon: UserPlus },
  ignore: { label: "Ignorar", icon: EyeOff },
};

/** Toast text for a confirmed import. */
export function importSummary(res: BulkResult) {
  const parts = [];
  if (res.created) parts.push(`${res.created} adicionado(s)`);
  if (res.updated) parts.push(`${res.updated} atualizado(s)`);
  if (res.ignored) parts.push(`${res.ignored} ignorado(s)`);
  return parts.join(" · ") || "nada a importar";
}

function confirmLabel(updates: number, creates: number) {
  if (updates && creates) return `Atualizar ${updates} e adicionar ${creates}`;
  if (updates) return `Atualizar ${updates} nota(s)`;
  if (creates) return `Adicionar ${creates} jogador(es)`;
  return "Nada a importar";
}

type Method = "text" | "file";

const SAMPLE = `Ronaldo - 9.5
Zico - 9
Cafu - 8
Dida - 7,5`;

export function ImportPlayersModal({
  open,
  group,
  onClose,
  onImported,
}: {
  open: boolean;
  group: GroupDetail;
  onClose: () => void;
  onImported: (result: BulkResult) => void;
}) {
  const [method, setMethod] = useState<Method>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMethod("text");
    setText("");
    setFile(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function loadPreview() {
    setError(null);
    const form = new FormData();
    if (method === "text") {
      if (!text.trim()) return setError('Cole ao menos uma linha no formato "Nome - Nota".');
      form.append("text", text);
    } else {
      if (!file) return setError("Selecione um arquivo .txt, .csv, .xls ou .xlsx.");
      form.append("file", file);
    }
    setBusy(true);
    try {
      const result = await api.postForm<ImportPreview>(`/groups/${group.id}/players/import`, form);
      setPreview(result);
      if (result.total === 0) setError("Nenhuma linha reconhecida no conteúdo.");
    } catch (err) {
      setError(errorMessage(err, "Falha ao ler os dados"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    // The server re-applies the same rules (by name), so only send what changes.
    const players = preview.rows
      .filter((r) => r.action !== "ignore")
      .map((r) => ({ name: r.name, skill: r.has_skill ? r.skill : null, position: r.position }));
    try {
      const res = await api.post<BulkResult>(`/groups/${group.id}/players/bulk`, { players });
      onImported(res);
      reset();
    } catch (err) {
      setError(errorMessage(err, "Falha ao importar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar jogadores"
      description={`Quem já está no grupo com o mesmo nome tem a nota atualizada (ou é ignorado, se a nota for a mesma). Notas fora da faixa do grupo (${fmtSkill(group.min_skill)} a ${fmtSkill(group.max_skill)}) são ajustadas.`}
      icon={FileUp}
      size="lg"
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {!preview && (
          <>
            <Segmented
              value={method}
              onChange={(m) => {
                setMethod(m);
                setError(null);
              }}
              options={[
                { value: "text", label: "Colar texto", icon: ClipboardPaste },
                { value: "file", label: "Arquivo", icon: FileSpreadsheet },
              ]}
              className="w-full"
            />

            {method === "text" ? (
              <div className="space-y-1.5">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={SAMPLE}
                  className="font-mono"
                />
                <p className="text-xs text-subtle">
                  Uma linha por jogador, no formato <span className="font-mono">Nome - Nota</span> (vírgula ou ponto).
                </p>
              </div>
            ) : (
              <FilePicker file={file} onPick={setFile} inputRef={fileRef} />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={loadPreview} loading={busy}>
                Pré-visualizar
              </Button>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="blue" icon={RefreshCw}>
                {preview.to_update} para atualizar
              </Badge>
              <Badge tone="green" icon={UserPlus}>
                {preview.to_create} para adicionar
              </Badge>
              <Badge icon={EyeOff}>{preview.ignored} ignorado(s)</Badge>
              <span className="text-subtle">de {preview.total} linhas</span>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2 text-center">Nota</th>
                    <th className="px-3 py-2">Posição</th>
                    <th className="px-3 py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <PreviewRow
                      key={i}
                      row={r}
                      // rows come ordered (update, create, ignore): a header opens each group
                      section={i === 0 || preview.rows[i - 1].action !== r.action ? sectionCount(preview, r.action) : null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setPreview(null)} disabled={busy}>
                Voltar
              </Button>
              <Button onClick={confirmImport} loading={busy} disabled={preview.to_update + preview.to_create === 0}>
                {confirmLabel(preview.to_update, preview.to_create)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function sectionCount(preview: ImportPreview, action: ImportAction) {
  return action === "update" ? preview.to_update : action === "create" ? preview.to_create : preview.ignored;
}

function PreviewRow({ row: r, section }: { row: ParsedPlayerRow; section: number | null }) {
  const { label, icon: Icon } = SECTIONS[r.action];
  const ignored = r.action === "ignore";
  // "sem nota, usando X" is moot when the row is ignored (nothing is written)
  const note = ignored && !r.has_skill ? null : r.note;
  return (
    <>
      {section !== null && (
        <tr className="border-t border-line bg-surface-2/50">
          <td colSpan={4} className="px-3 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              <Icon size={13} /> {label} ({section})
            </span>
          </td>
        </tr>
      )}
      <tr className={cx("border-t border-line", ignored && "text-subtle")}>
        <td className={cx("px-3 py-1.5", !ignored && "font-medium text-fg")}>{r.name || "—"}</td>
        <td className="whitespace-nowrap px-3 py-1.5 text-center tabular">
          {r.action === "update" && r.current_skill !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-subtle line-through">{fmtSkill(r.current_skill)}</span>
              <ArrowRight size={12} className="text-subtle" />
              <span className="font-semibold text-fg">{fmtSkill(r.skill)}</span>
            </span>
          ) : ignored && r.current_skill !== null ? (
            fmtSkill(r.current_skill)
          ) : r.name ? (
            fmtSkill(r.skill)
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-1.5">{r.position || "—"}</td>
        <td className="px-3 py-1.5 text-xs">
          {r.error ? (
            <span className="text-red-500">{r.error}</span>
          ) : r.reason || note ? (
            <span className="flex flex-col gap-0.5">
              {r.reason && <span>{r.reason}</span>}
              {note && <span className="text-amber-600 dark:text-amber-400">{note}</span>}
            </span>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>
      </tr>
    </>
  );
}

export function FilePicker({
  file,
  onPick,
  inputRef,
  hint,
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  inputRef: RefObject<HTMLInputElement>;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2/40 px-4 py-8 text-sm text-muted transition-colors hover:border-brand-500/60 hover:text-fg"
      >
        <Upload size={22} className="text-accent" />
        {file ? (
          <span className="font-medium text-fg">{file.name}</span>
        ) : (
          <span>Clique para escolher um arquivo .txt, .csv, .xls ou .xlsx</span>
        )}
      </button>
      <p className="text-xs text-subtle">
        {hint ?? (
          <>
            <strong>.txt</strong>: linhas <span className="font-mono">Nome - Nota</span>. <strong>.csv / .xls / .xlsx</strong>:
            colunas <span className="font-mono">Nome</span>, <span className="font-mono">Nota</span> e{" "}
            <span className="font-mono">Posição</span> (opcional).
          </>
        )}
      </p>
    </div>
  );
}
