import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Download, FileText, Image as ImageIcon, Moon, Share2, Sun } from "lucide-react";
import { downloadCanvas, type ImageTheme } from "../lib/exportImage";
import { useToast } from "./Feedback";
import { Button, Card, Spinner, Textarea, cx } from "./ui";

type Mode = "text" | "image" | null;

export function ExportPanel({
  title = "Exportar",
  getText,
  renderImage,
  filename,
  options,
}: {
  title?: string;
  getText: () => string;
  renderImage: (canvas: HTMLCanvasElement, theme: ImageTheme) => Promise<void>;
  filename: string; // without extension
  options?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [rendering, setRendering] = useState(false);
  const canvases = { light: useRef<HTMLCanvasElement>(null), dark: useRef<HTMLCanvasElement>(null) };
  const toast = useToast();

  // keep the open export in sync with the data / options
  useEffect(() => {
    if (mode === "text") setText(getText());
  }, [mode, getText]);

  useEffect(() => {
    if (mode !== "image") return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      for (const theme of ["light", "dark"] as ImageTheme[]) {
        const canvas = canvases[theme].current;
        if (canvas && !cancelled) await renderImage(canvas, theme);
      }
      if (!cancelled) setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, renderImage]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiado para a área de transferência");
    } catch {
      toast("Não foi possível copiar — selecione o texto e use Ctrl+C", { tone: "error" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <Share2 size={16} />
          </span>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {options}
          <Button
            variant={mode === "text" ? "primary" : "secondary"}
            size="sm"
            icon={FileText}
            onClick={() => setMode(mode === "text" ? null : "text")}
          >
            Texto
          </Button>
          <Button
            variant={mode === "image" ? "primary" : "secondary"}
            size="sm"
            icon={ImageIcon}
            onClick={() => setMode(mode === "image" ? null : "image")}
          >
            Imagem
          </Button>
        </div>
      </div>

      {mode === "text" && (
        <div className="mt-4 space-y-2">
          <Textarea readOnly value={text} rows={14} className="font-mono text-xs leading-relaxed" />
          <Button size="sm" icon={Copy} onClick={copy}>
            Copiar texto
          </Button>
        </div>
      )}

      {mode === "image" && (
        <div className="relative mt-4">
          {rendering && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/70">
              <Spinner label="Gerando imagens..." />
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["light", "Fundo claro", Sun],
                ["dark", "Fundo escuro", Moon],
              ] as const
            ).map(([theme, label, Icon]) => (
              <div key={theme} className="min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
                    <Icon size={15} />
                    {label}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Download}
                    disabled={rendering}
                    onClick={() => {
                      const canvas = canvases[theme].current;
                      if (canvas) downloadCanvas(canvas, `${filename}-${theme === "light" ? "claro" : "escuro"}.png`);
                    }}
                  >
                    Baixar PNG
                  </Button>
                </div>
                <canvas
                  ref={canvases[theme]}
                  className={cx("block h-auto w-full rounded-xl border border-line")}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
