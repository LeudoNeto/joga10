import { useEffect, useRef } from "react";
import { CARD_TEMPLATES, getNameCqw, getTemplate } from "../lib/cards";
import { cx } from "./ui";

interface PlayerCardProps {
  name: string;
  position?: string | null;
  points?: number;
  goals?: number;
  assists?: number;
  imageUrl?: string | null;
  templateId?: string | null;
  className?: string;
}

const cardImageCache = new Map<string, HTMLImageElement>();

function getLoadedImage(src: string): Promise<HTMLImageElement> {
  const existing = cardImageCache.get(src);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cardImageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

// Pre-warm cache for base templates
if (typeof window !== "undefined") {
  for (const t of CARD_TEMPLATES) {
    getLoadedImage(t.fullUrl).catch(() => {});
    getLoadedImage(t.emptyUrl).catch(() => {});
  }
}

export function PlayerCard({
  name,
  position = "MEI",
  points = 55,
  goals = 5,
  assists = 5,
  imageUrl,
  templateId,
  className,
}: PlayerCardProps) {
  const template = getTemplate(templateId);
  const posDisplay = (position || "MEI").toUpperCase();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const strongShadow =
    "0 2px 5px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.9), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px #000";

  const isTemplate1 = template.id === "card-template";
  const nameTop = isTemplate1 ? "66%" : "63.5%";
  const statsTop = isTemplate1 ? "73.5%" : "69%";
  const statsWidth = isTemplate1 ? "78%" : "76%";
  const nameFontSize = `clamp(9px, ${getNameCqw(name)}cqw, 24px)`;

  const isThreeDigits = (points ?? 0) >= 100;
  const scoreFontSize = isThreeDigits
    ? "clamp(14px, 10.2cqw, 35px)"
    : "clamp(18px, 13cqw, 44px)";

  // High-precision canvas masking engine: identical to export poster, guarantees 100% transparent corners outside shield
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const w = template.width;
    const h = template.height;
    canvas.width = w;
    canvas.height = h;

    const render = async () => {
      try {
        if (!imageUrl) {
          const fullImg = await getLoadedImage(template.fullUrl);
          if (cancelled) return;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(fullImg, 0, 0, w, h);
          return;
        }

        const [playerImg, fullImg, emptyImg] = await Promise.all([
          getLoadedImage(imageUrl),
          getLoadedImage(template.fullUrl),
          getLoadedImage(template.emptyUrl),
        ]);

        if (cancelled) return;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw player image scaled to fill card dimensions
        ctx.drawImage(playerImg, 0, 0, w, h);

        // 2. Strict destination-in shield clipping (guarantees 100% transparent corners outside shield)
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(fullImg, 0, 0, w, h);

        // 3. Crisp golden border overlay on top
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(emptyImg, 0, 0, w, h);
      } catch {
        if (cancelled) return;
        ctx.clearRect(0, 0, w, h);
        try {
          const fallback = await getLoadedImage(template.fullUrl);
          if (!cancelled) ctx.drawImage(fallback, 0, 0, w, h);
        } catch {
          // ignore
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, template.id, template.width, template.height, template.fullUrl, template.emptyUrl]);

  return (
    <div
      className={cx(
        "relative select-none transition-transform [container-type:inline-size]",
        className
      )}
      style={{
        aspectRatio: `${template.width} / ${template.height}`,
        filter: "drop-shadow(0 14px 22px rgba(0, 0, 0, 0.7))",
      }}
    >
      {/* Background card canvas (composited with destination-in shield clipping and border overlay) */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none h-full w-full object-contain"
      />

      {/* Top Left: Score, PTS, Position */}
      <div
        className="pointer-events-none absolute flex flex-col items-center px-1"
        style={{
          top: isTemplate1 ? "18%" : "19%",
          left: isTemplate1 ? "14%" : "15%",
          minWidth: "16cqw",
        }}
      >
        <span
          className="font-black leading-none text-white"
          style={{
            textShadow: strongShadow,
            fontSize: scoreFontSize,
          }}
        >
          {points}
        </span>
        <span
          className="font-extrabold uppercase tracking-widest text-amber-300"
          style={{
            textShadow: strongShadow,
            fontSize: "clamp(6px, 3.4cqw, 12px)",
          }}
        >
          PTS
        </span>
        <span
          className="mt-[0.5cqw] font-black uppercase tracking-wider text-white"
          style={{
            textShadow: strongShadow,
            fontSize: "clamp(7px, 4.4cqw, 15px)",
          }}
        >
          {posDisplay}
        </span>
      </div>

      {/* Center-Lower: Player Name */}
      <div
        className="pointer-events-none absolute px-2 text-center"
        style={{
          top: nameTop,
          left: "50%",
          transform: "translateX(-50%)",
          width: "86%",
        }}
      >
        <h3
          className="truncate whitespace-nowrap font-black uppercase tracking-wider text-white"
          style={{
            textShadow: strongShadow,
            fontSize: nameFontSize,
            lineHeight: 1.15,
          }}
        >
          {name}
        </h3>
      </div>

      {/* Bottom Section: Separator Line + Stats */}
      <div
        className="pointer-events-none absolute flex flex-col items-center"
        style={{
          top: statsTop,
          left: "50%",
          transform: "translateX(-50%)",
          width: statsWidth,
        }}
      >
        {/* Horizontal Separator Line */}
        <div
          className="h-px w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255, 215, 0, 0.75) 20%, rgba(255, 255, 255, 0.95) 50%, rgba(255, 215, 0, 0.75) 80%, transparent 100%)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
          }}
        />

        {/* Bottom Stats: Gols & Assists */}
        <div className="mt-1 flex w-full items-center justify-around">
          {/* Goals */}
          <div className="flex flex-col items-center">
            <span
              className="font-black text-white"
              style={{
                textShadow: strongShadow,
                fontSize: "clamp(12px, 8cqw, 28px)",
                lineHeight: 1.1,
              }}
            >
              {goals}
            </span>
            <span
              className="font-extrabold uppercase tracking-widest text-slate-100"
              style={{
                textShadow: strongShadow,
                fontSize: "clamp(6px, 3.4cqw, 12px)",
              }}
            >
              GOLS
            </span>
          </div>

          {/* Assists */}
          <div className="flex flex-col items-center">
            <span
              className="font-black text-white"
              style={{
                textShadow: strongShadow,
                fontSize: "clamp(12px, 8cqw, 28px)",
                lineHeight: 1.1,
              }}
            >
              {assists}
            </span>
            <span
              className="font-extrabold uppercase tracking-widest text-slate-100"
              style={{
                textShadow: strongShadow,
                fontSize: "clamp(6px, 3.4cqw, 12px)",
              }}
            >
              ASSISTS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
