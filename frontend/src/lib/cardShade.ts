/**
 * "Shades" are solid-colour rectangles with a soft gradient edge that are painted
 * over the player's photo (like the dark fade behind the name/stats in card-idea.jpg).
 *
 * The same drawing routine is used for the live preview and for the final export,
 * so what the user sees in the editor is exactly what gets saved.
 */

export type ShadeSide = "bottom" | "left";

export interface CardShade {
  enabled: boolean;
  color: string;
  /** Horizontal offset in % of card width. For the left shade it's how far the shade reaches into the card. */
  offsetX: number;
  /** Vertical offset in % of card height. For the bottom shade it's how far the shade reaches into the card. */
  offsetY: number;
  /** Rotation in degrees (around the middle of the shade's inner edge). */
  rotation: number;
  /** Arc angle in degrees (-180..180) of the edge facing the card centre. >0 bulges towards the centre, <0 is concave. */
  arc: number;
  /** Length of the gradient in % of the card dimension perpendicular to the edge. */
  fade: number;
}

export const DEFAULT_BOTTOM_SHADE: CardShade = {
  enabled: true,
  color: "#141414",
  offsetX: 0,
  offsetY: 50,
  rotation: 0,
  arc: 0,
  fade: 24,
};

export const DEFAULT_LEFT_SHADE: CardShade = {
  enabled: true,
  color: "#141414",
  offsetX: 30,
  offsetY: 0,
  rotation: 0,
  arc: 0,
  fade: 18,
};

const ARC_SAMPLES = 96;

/** Displacement of the edge (along the "towards centre" axis) at position `u` along the edge. 0 at the middle. */
function edgeDisplacement(u: number, chord: number, arcDeg: number): number {
  const theta = (Math.min(180, Math.abs(arcDeg)) * Math.PI) / 180;
  if (theta < 1e-3) return 0;
  const half = chord / 2;
  const r = half / Math.sin(theta / 2);
  const x = Math.min(Math.abs(u), half);
  const dip = r - Math.sqrt(Math.max(0, r * r - x * x));
  return arcDeg > 0 ? -dip : dip;
}

/**
 * Draws a single shade on `ctx` covering a `w` x `h` pixel card.
 * Assumes the context has no transform applied (shadow offsets are in raw pixels).
 */
export function drawCardShade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shade: CardShade,
  side: ShadeSide
) {
  if (!shade.enabled) return;

  const isBottom = side === "bottom";
  const chord = isBottom ? w : h; // length of the edge facing the centre
  const depth = isBottom ? h : w; // dimension perpendicular to that edge
  const reach = ((isBottom ? shade.offsetY : shade.offsetX) / 100) * depth;
  const shift = isBottom ? (shade.offsetX / 100) * w : (shade.offsetY / 100) * h;
  const fade = Math.max(0, (shade.fade / 100) * depth);
  const blur = fade / 2; // gaussian sigma = blur/2  ->  ~95% of the transition spans `fade`
  const big = 2 * (w + h);
  const off = 3 * big;

  // Local coords: u runs along the edge, v points towards the card centre.
  const toXY = isBottom
    ? (u: number, v: number): [number, number] => [u, -v]
    : (u: number, v: number): [number, number] => [v, u];

  // The hard edge sits in the middle of the gradient; blur spreads it by ±fade/2,
  // so the visible shade ends at the offset and is fully solid `fade` before it.
  const hardEdge = (u: number) => edgeDisplacement(u, chord, shade.arc) - fade / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const useBlur = blur > 0.5;
  if (useBlur) {
    // Draw the shape far off-canvas and only let its blurred shadow land on the card.
    ctx.shadowColor = shade.color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = off;
    ctx.shadowOffsetY = 0;
    ctx.translate(-off, 0);
  }

  if (isBottom) ctx.translate(w / 2 + shift, h - reach);
  else ctx.translate(reach, h / 2 + shift);
  ctx.rotate((shade.rotation * Math.PI) / 180);

  ctx.fillStyle = shade.color;
  ctx.beginPath();
  ctx.moveTo(...toXY(-big, -big));
  ctx.lineTo(...toXY(-big, hardEdge(-big)));
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const u = -chord / 2 + (chord * i) / ARC_SAMPLES;
    ctx.lineTo(...toXY(u, hardEdge(u)));
  }
  ctx.lineTo(...toXY(big, hardEdge(big)));
  ctx.lineTo(...toXY(big, -big));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawCardShades(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bottom: CardShade,
  left: CardShade
) {
  drawCardShade(ctx, w, h, left, "left");
  drawCardShade(ctx, w, h, bottom, "bottom");
}
