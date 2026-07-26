import { useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { ImportPreview } from "../../types";
import { Alert, Badge, Button, Modal, Textarea, cx } from "../../components/ui";

type Method = "text" | "file";

const SAMPLE = `Ronaldo - 9.5
Zico - 9
Cafu - 8
Dida - 7,5`;

export function ImportPlayersModal({
  open,
  groupId,
  onClose,
  onImported,
}: {
  open: boolean;
  groupId: number;
  onClose: () => void;
  onImported: (count: number) => void;
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
    setBusy(true);
    try {
      const form = new FormData();
      if (method === "text") {
        if (!text.trim()) {
          setError("Cole ao menos uma linha no formato \"Nome - Nota\".");
          setBusy(false);
          return;
        }
        form.append("text", text);
      } else {
        if (!file) {
          setError("Selecione um arquivo .txt, .csv, .xls ou .xlsx.");
          setBusy(false);
          return;
        }
        form.append("file", file);
      }
      const result = await api.postForm<ImportPreview>(
        `/groups/${groupId}/players/import`,
        form
      );
      setPreview(result);
      if (result.total === 0) setError("Nenhuma linha reconhecida no conteúdo.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao ler os dados");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const players = preview.rows
      .filter((r) => !r.error && r.name)
      .map((r) => ({ name: r.name, skill: r.skill, position: r.position }));
    try {
      const res = await api.post<{ created: number }>(
        `/groups/${groupId}/players/bulk`,
        { players }
      );
      onImported(res.created);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Importar jogadores">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(
            [
              ["text", "Colar texto"],
              ["file", "Arquivo (.txt/.csv/.xls/.xlsx)"],
            ] as [Method, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setMethod(key);
                setPreview(null);
                setError(null);
              }}
              className={cx(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition",
                method === key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {method === "text" ? (
          <div className="space-y-1">
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
              rows={7}
              placeholder={SAMPLE}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-400">
              Uma linha por jogador, no formato{" "}
              <span className="font-mono">Nome - Nota</span> (a nota pode usar
              vírgula ou ponto).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.xls,.xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-pitch-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-pitch-700"
            />
            <p className="text-xs text-slate-400">
              <strong>.txt</strong>: linhas <span className="font-mono">Nome - Nota</span>.{" "}
              <strong>.csv / .xls / .xlsx</strong>: colunas{" "}
              <span className="font-mono">Nome</span>,{" "}
              <span className="font-mono">Nota</span> e{" "}
              <span className="font-mono">Posição</span> (opcional).
            </p>
          </div>
        )}

        {!preview && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button onClick={loadPreview} disabled={busy}>
              {busy ? "Lendo..." : "Pré-visualizar"}
            </Button>
          </div>
        )}

        {preview && (
          <PreviewTable
            preview={preview}
            busy={busy}
            onBack={() => setPreview(null)}
            onConfirm={confirmImport}
          />
        )}
      </div>
    </Modal>
  );
}

function PreviewTable({
  preview,
  busy,
  onBack,
  onConfirm,
}: {
  preview: ImportPreview;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color="green">{preview.valid} válidos</Badge>
        {preview.invalid > 0 && (
          <Badge color="red">{preview.invalid} ignorados</Badge>
        )}
        <span className="text-slate-400">de {preview.total} linhas</span>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2 text-center">Nota</th>
              <th className="px-3 py-2">Posição</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r, i) => {
              const invalid = Boolean(r.error) || !r.name;
              return (
                <tr
                  key={i}
                  className={cx(
                    "border-t border-slate-100",
                    invalid && "bg-red-50 text-slate-400"
                  )}
                >
                  <td className="px-3 py-1.5">{r.name || "—"}</td>
                  <td className="px-3 py-1.5 text-center">{r.skill.toFixed(1)}</td>
                  <td className="px-3 py-1.5">{r.position || "—"}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {r.error ? (
                      <span className="text-red-500">{r.error}</span>
                    ) : r.note ? (
                      <span className="text-amber-500">{r.note}</span>
                    ) : (
                      <span className="text-pitch-600">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={busy || preview.valid === 0}>
          {busy ? "Importando..." : `Importar ${preview.valid} jogador(es)`}
        </Button>
      </div>
    </div>
  );
}
