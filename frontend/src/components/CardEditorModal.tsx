import { useEffect, useRef, useState } from "react";
import {
  Check,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CARD_TEMPLATES, getTemplate, POSITION_PRESETS } from "../lib/cards";
import { Alert, Button, Field, Input, Modal, cx } from "./ui";

interface CardEditorModalProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  initialPosition?: string | null;
  playerName: string;
  initialTemplateId?: string | null;
  onSave: (data: { blob: Blob; position: string; templateId: string }) => Promise<void>;
}

export function CardEditorModal({
  open,
  onClose,
  file,
  initialPosition = "MEI",
  playerName,
  initialTemplateId = "card-template",
  onSave,
}: CardEditorModalProps) {
  const [templateId, setTemplateId] = useState(initialTemplateId || "card-template");
  const [position, setPosition] = useState(initialPosition || "MEI");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 310, height: 420 });
  const template = getTemplate(templateId);

  const strongShadow =
    "0 2px 4px #000, 0 0 14px rgba(0,0,0,0.95), 0 1px 2px #000, -1px -1px 0 rgba(0,0,0,0.8), 1px -1px 0 rgba(0,0,0,0.8), -1px 1px 0 rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.8)";

  const maskStyle = {
    maskImage: `url(${template.fullUrl})`,
    WebkitMaskImage: `url(${template.fullUrl})`,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth || 310,
          height: containerRef.current.clientHeight || 420,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [open, templateId]);

  // Load image from file
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setImageObj(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageObj(img);
    img.src = url;

    // Reset position and zoom on new file
    setZoom(1);
    setPan({ x: 0, y: 0 });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Sync initial values
  useEffect(() => {
    if (open) {
      if (initialPosition) setPosition(initialPosition);
      if (initialTemplateId) setTemplateId(initialTemplateId);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setError(null);
    }
  }, [open, initialPosition, initialTemplateId]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ x: pan.x, y: pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: panStart.x + (e.clientX - dragStart.x),
      y: panStart.y + (e.clientY - dragStart.y),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setPanStart({ x: pan.x, y: pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: panStart.x + (e.touches[0].clientX - dragStart.x),
      y: panStart.y + (e.touches[0].clientY - dragStart.y),
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  // Wheel zoom (allows zooming out down to 0.1x smoothly)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((z) => Math.max(0.1, Math.min(4.0, Math.round((z + delta) * 100) / 100)));
  };

  const resetTransform = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Base scale: at zoom = 1, fits the whole image inside the preview container
  const cWidth = containerSize.width;
  const cHeight = containerSize.height;
  const fitScale = imageObj
    ? Math.min(cWidth / imageObj.naturalWidth, cHeight / imageObj.naturalHeight)
    : 1;

  // Cover scale: zoom factor that makes the image cover the whole card
  const coverZoom = imageObj
    ? Math.max(cWidth / imageObj.naturalWidth, cHeight / imageObj.naturalHeight) / fitScale
    : 1;

  const displayedWidth = imageObj ? imageObj.naturalWidth * fitScale * zoom : 0;
  const displayedHeight = imageObj ? imageObj.naturalHeight * fitScale * zoom : 0;
  const displayedLeft = cWidth / 2 + pan.x - displayedWidth / 2;
  const displayedTop = cHeight / 2 + pan.y - displayedHeight / 2;

  // Render clean composite base image to canvas and save
  const handleSave = async () => {
    if (!imageObj || !containerRef.current) return;
    setSaving(true);
    setError(null);

    try {
      const tWidth = template.width;
      const tHeight = template.height;
      const scaleMultiplier = tWidth / cWidth;

      // Exact pixel coordinates in canvas space
      const canvasDrawWidth = displayedWidth * scaleMultiplier;
      const canvasDrawHeight = displayedHeight * scaleMultiplier;
      const canvasDestX = displayedLeft * scaleMultiplier;
      const canvasDestY = displayedTop * scaleMultiplier;

      // Create offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = tWidth;
      canvas.height = tHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível criar o contexto gráfico");

      // 1. Draw template full image in background (fills any gaps if image is zoomed out or doesn't cover card)
      const fullImg = new Image();
      fullImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        fullImg.onload = () => resolve();
        fullImg.onerror = () => reject(new Error("Falha ao carregar o fundo do card"));
        fullImg.src = template.fullUrl;
      });
      ctx.drawImage(fullImg, 0, 0, tWidth, tHeight);

      // 2. Draw user's image at exact position & zoom
      ctx.drawImage(imageObj, canvasDestX, canvasDestY, canvasDrawWidth, canvasDrawHeight);

      // 3. Clip everything outside the card shield so it becomes 100% transparent
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(fullImg, 0, 0, tWidth, tHeight);
      ctx.globalCompositeOperation = "source-over";

      // 4. Load and draw empty template overlay (border only) - WITHOUT any text!
      const emptyImg = new Image();
      emptyImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        emptyImg.onload = () => resolve();
        emptyImg.onerror = () => reject(new Error("Falha ao carregar a borda do card"));
        emptyImg.src = template.emptyUrl;
      });
      ctx.drawImage(emptyImg, 0, 0, tWidth, tHeight);

      // Export to PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Falha ao gerar o arquivo de imagem"));
        }, "image/png");
      });

      await onSave({
        blob,
        position: position.trim().toUpperCase() || "MEI",
        templateId,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar o card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encaixar Imagem no Card"
      icon={Sparkles}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-subtle">
            <Move size={14} />
            <span>Arraste para posicionar livremente • Use o zoom abaixo</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button icon={Check} onClick={handleSave} loading={saving}>
              Salvar Carta
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <div className="grid gap-6 md:grid-cols-[310px_1fr]">
          {/* Card Preview / Interactive Canvas */}
          <div className="flex flex-col items-center">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              className={cx(
                "relative h-[420px] select-none shadow-2xl transition-all",
                isDragging ? "cursor-grabbing" : "cursor-grab"
              )}
              style={{
                width: `${Math.round(420 * (template.width / template.height))}px`,
                aspectRatio: `${template.width} / ${template.height}`,
              }}
            >
              {/* Clipped Card Body: masked to shield shape so nothing spills outside the border */}
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden"
                style={{
                  maskImage: `url(${template.fullUrl})`,
                  WebkitMaskImage: `url(${template.fullUrl})`,
                  maskSize: "100% 100%",
                  WebkitMaskSize: "100% 100%",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                }}
              >
                {/* Layer 0: Template Full Background (visible if user zooms out or moves image) */}
                <img
                  src={template.fullUrl}
                  alt="Fundo do card"
                  className="h-full w-full object-contain"
                  draggable={false}
                />

                {/* Layer 1: User's Image (scaled and panned) */}
                {imageUrl && imageObj && (
                  <img
                    src={imageUrl}
                    alt="Sua foto"
                    draggable={false}
                    className="absolute will-change-transform"
                    style={{
                      width: `${displayedWidth}px`,
                      height: `${displayedHeight}px`,
                      left: `${displayedLeft}px`,
                      top: `${displayedTop}px`,
                      maxWidth: "none",
                      maxHeight: "none",
                    }}
                  />
                )}
              </div>

              {/* Layer 2: Empty Template Border */}
              <img
                src={template.emptyUrl}
                alt="Borda do card"
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />

              {/* Layer 3: Live Preview Overlays */}
              {/* Top-Left: Score, PTS, Position (localized soft backing) */}
              <div
                className="pointer-events-none absolute flex flex-col items-center rounded-xl px-2 py-1"
                style={{
                  top: "18%",
                  left: "14%",
                  minWidth: "52px",
                  background:
                    "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.25) 55%, transparent 80%)",
                }}
              >
                <span
                  className="text-3xl font-black leading-none text-white sm:text-4xl"
                  style={{ textShadow: strongShadow }}
                >
                  55
                </span>
                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 sm:text-xs"
                  style={{ textShadow: strongShadow }}
                >
                  PTS
                </span>
                <span
                  className="mt-1.5 text-xs font-black uppercase tracking-wider text-white sm:text-sm"
                  style={{ textShadow: strongShadow }}
                >
                  {position.toUpperCase() || "MEI"}
                </span>
              </div>

              {/* Center: Player Name (localized soft backing) */}
              <div
                className="pointer-events-none absolute px-2 text-center"
                style={{
                  top: "56%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "84%",
                }}
              >
                <div
                  className="rounded-lg px-2 py-0.5"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.28) 55%, transparent 80%)",
                  }}
                >
                  <h3
                    className="line-clamp-2 text-base font-black uppercase tracking-wider text-white sm:text-xl"
                    style={{ textShadow: strongShadow }}
                  >
                    {playerName}
                  </h3>
                </div>
              </div>

              {/* Bottom Section: Separator Line + Stats (localized soft backing) */}
              <div
                className="pointer-events-none absolute flex flex-col items-center"
                style={{
                  top: "68%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "76%",
                  background:
                    "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.25) 60%, transparent 85%)",
                  padding: "4px 8px",
                  borderRadius: "12px",
                }}
              >
                {/* Separator Line */}
                <div
                  className="h-px w-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255, 215, 0, 0.75) 20%, rgba(255, 255, 255, 0.95) 50%, rgba(255, 215, 0, 0.75) 80%, transparent 100%)",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
                  }}
                />

                {/* Bottom Stats: 5 GOLS | 5 ASSISTS */}
                <div className="mt-1 flex w-full items-center justify-around">
                  <div className="flex flex-col items-center">
                    <span
                      className="text-xl font-black text-white sm:text-2xl"
                      style={{ textShadow: strongShadow }}
                    >
                      5
                    </span>
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-widest text-slate-100 sm:text-[11px]"
                      style={{ textShadow: strongShadow }}
                    >
                      GOLS
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span
                      className="text-xl font-black text-white sm:text-2xl"
                      style={{ textShadow: strongShadow }}
                    >
                      5
                    </span>
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-widest text-slate-100 sm:text-[11px]"
                      style={{ textShadow: strongShadow }}
                    >
                      ASSISTS
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2 text-center text-xs text-subtle">
              Preview com dados padrão (55 PTS, 5 GOLS, 5 ASSISTS)
            </p>
          </div>

          {/* Controls Column */}
          <div className="space-y-4">
            {/* Template Selection */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Escolha o Modelo de Card
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {CARD_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cx(
                      "flex flex-col items-center rounded-xl border p-2 text-center transition-all",
                      templateId === t.id
                        ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/30"
                        : "border-line bg-surface-2 hover:border-line-strong"
                    )}
                  >
                    <img
                      src={t.fullUrl}
                      alt={t.name}
                      className="h-16 w-12 rounded object-contain"
                    />
                    <span className="mt-1 text-xs font-semibold text-fg">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Position Picker */}
            <div>
              <Field
                label="Posição do Jogador"
                hint="Escolha um atalho ou digite a sua posição"
              >
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value.toUpperCase())}
                  placeholder="Ex: ATA, MEI, CA, GOL..."
                  maxLength={10}
                />
              </Field>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {POSITION_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPosition(p)}
                    className={cx(
                      "rounded-lg px-2 py-1 text-xs font-bold transition-colors",
                      position === p
                        ? "bg-brand-600 text-white"
                        : "bg-surface-2 text-fg hover:bg-surface-3 border border-line"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom Control */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-subtle">
                <span>Zoom da Imagem</span>
                <span className="tabular">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ZoomOut}
                  onClick={() => setZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 100) / 100))}
                  title="Diminuir zoom"
                />
                <input
                  type="range"
                  min="0.1"
                  max="3.5"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-brand-600"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ZoomIn}
                  onClick={() => setZoom((z) => Math.min(3.5, Math.round((z + 0.1) * 100) / 100))}
                  title="Aumentar zoom"
                />
              </div>

              {/* Quick Zoom Presets */}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Minimize2}
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Ajustar imagem inteira dentro do card"
                >
                  Ajustar (Fit)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Maximize2}
                  onClick={() => {
                    setZoom(Math.round(coverZoom * 100) / 100);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Preencher todo o card"
                >
                  Preencher
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={resetTransform}
                  title="Centralizar posição"
                >
                  Centralizar
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-xs text-muted leading-relaxed">
              💡 <strong>Liberdade total:</strong> Você pode tirar bastante zoom e mover a imagem livremente,
              sem obrigação de cobrir as bordas. O fundo temático do card preenche os espaços vazios e a moldura
              dourada dá o acabamento final.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
