import { getTemplate } from "../lib/cards";
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

  return (
    <div
      className={cx(
        "relative select-none overflow-hidden rounded-2xl drop-shadow-2xl transition-transform",
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
          minWidth: "52px",
          background:
            "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.25) 55%, transparent 80%)",
        }}
      >
        <span
          className="text-3xl font-black leading-none text-white sm:text-4xl"
          style={{ textShadow: strongShadow }}
        >
          {points}
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
          {posDisplay}
        </span>
      </div>

      {/* Center-Lower: Player Name (localized soft backing) */}
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
            {name}
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
              className="text-xl font-black text-white sm:text-2xl"
              style={{ textShadow: strongShadow }}
            >
              {goals}
            </span>
            <span
              className="text-[9px] font-extrabold uppercase tracking-widest text-slate-100 sm:text-[11px]"
              style={{ textShadow: strongShadow }}
            >
              GOLS
            </span>
          </div>

          {/* Assists */}
          <div className="flex flex-col items-center">
            <span
              className="text-xl font-black text-white sm:text-2xl"
              style={{ textShadow: strongShadow }}
            >
              {assists}
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
  );
}
