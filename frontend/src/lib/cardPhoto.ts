import { DEFAULT_BOTTOM_SHADE, DEFAULT_LEFT_SHADE, drawCardShades } from "./cardShade";

/** Share of the card height the photo covers from the top: the face stays in
 * the upper part, clear of the name and stats, and the photo's lower edge
 * falls inside the solid part of the bottom shade. */
const PHOTO_HEIGHT = 0.8;

/**
 * Card made on the fly from the plain photo ("foto limpa") of a player who
 * has no card art: what the card editor would save with its default shades.
 * Draws on a `w` x `h` canvas without transform; the shield clipping and the
 * golden frame are applied afterwards by the caller, as for the card art.
 */
export function drawPhotoAsCard(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement,
  background: HTMLImageElement | null,
  w: number,
  h: number
) {
  if (background) ctx.drawImage(background, 0, 0, w, h);
  const boxH = h * PHOTO_HEIGHT;
  const scale = Math.max(w / photo.naturalWidth, boxH / photo.naturalHeight);
  const dw = photo.naturalWidth * scale;
  const dh = photo.naturalHeight * scale;
  ctx.drawImage(photo, (w - dw) / 2, 0, dw, dh);
  drawCardShades(ctx, w, h, DEFAULT_BOTTOM_SHADE, DEFAULT_LEFT_SHADE);
}
