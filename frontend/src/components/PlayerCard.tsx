import { getNameCqw, getTemplate } from "../lib/cards";
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
  const bg = imageUrl || template.fullUrl;
  const posDisplay = (position || "MEI").toUpperCase();

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

  const nameFontSize = `clamp(9px, ${getNameCqw(name)}cqw, 24px)`;

  const isTemplate1 = template.id === "card-template";
  const nameTop = isTemplate1 ? "66%" : "63.5%";
  const statsTop = isTemplate1 ? "73.5%" : "69%";
  const statsWidth = isTemplate1 ? "78%" : "76%";

  return (
    <div
      className={cx(
        "relative select-none overflow-hidden rounded-2xl drop-shadow-2xl transition-transform [container-type:inline-size]",
        className
      )}
      style={{
        aspectRatio: `${template.width} / ${template.height}`,
      }}
    >
      {/* Background card image (masked to shield shape so corners outside remain transparent) */}
      <img
        src={bg}
        alt={name}
        className="pointer-events-none h-full w-full object-contain"
        draggable={false}
        style={maskStyle}
      />

      {/* Top Left: Score, PTS, Position (localized soft backing) */}
      <div
        className="pointer-events-none absolute flex flex-col items-center rounded-xl px-2 py-1"
        style={{
          top: "18%",
          left: "14%",
          minWidth: "16cqw",
          background:
            "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.25) 55%, transparent 80%)",
        }}
      >
        <span
          className="font-black leading-none text-white"
          style={{
            textShadow: strongShadow,
            fontSize: "clamp(18px, 13cqw, 44px)",
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

      {/* Center-Lower: Player Name (localized soft backing, always single line without breaking) */}
      <div
        className="pointer-events-none absolute px-2 text-center"
        style={{
          top: nameTop,
          left: "50%",
          transform: "translateX(-50%)",
          width: "86%",
        }}
      >
        <div
          className="overflow-hidden rounded-lg px-2 py-0.5"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.28) 55%, transparent 80%)",
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
      </div>

      {/* Bottom Section: Separator Line + Stats (localized soft backing) */}
      <div
        className="pointer-events-none absolute flex flex-col items-center"
        style={{
          top: statsTop,
          left: "50%",
          transform: "translateX(-50%)",
          width: statsWidth,
          background:
            "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.25) 60%, transparent 85%)",
          padding: "4px 8px",
          borderRadius: "12px",
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
