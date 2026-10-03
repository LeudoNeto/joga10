/* PNG exports drawn on a canvas, in a light and a dark variant (port of
   team-balance's gerarImagem, extended with a ranking card). */
import type { EventItem, RankingRow } from "../types";
import { formatDate, fmt2, readableOn } from "./format";
import type { ExportTeam } from "./exportText";
import { RANKING_FORMULA } from "./exportText";
import { getTemplate } from "./cards";

export type ImageTheme = "light" | "dark";

interface Palette {
  bg: string;
  title: string;
  subtitle: string;
  shadow: string;
  card: string;
  border: string;
  zebra: string;
  name: string;
  substitute: string;
  total: string;
  accent: string;
  track: string;
}

const PALETTES: Record<ImageTheme, Palette> = {
  light: {
    bg: "#f4f4f5",
    title: "#18181b",
    subtitle: "#52525b",
    shadow: "#e4e4e7",
    card: "#ffffff",
    border: "#e4e4e7",
    zebra: "#fafafa",
    name: "#27272a",
    substitute: "#a1a1aa",
    total: "#3f3f46",
    accent: "#dc2626",
    track: "#f4f4f5",
  },
  dark: {
    bg: "#09090b",
    title: "#f4f4f5",
    subtitle: "#a1a1aa",
    shadow: "#000000",
    card: "#131316",
    border: "#26262b",
    zebra: "#1a1a1e",
    name: "#e4e4e7",
    substitute: "#71717a",
    total: "#d4d4d8",
    accent: "#ef4444",
    track: "#26262b",
  },
};

const FONT = '"Inter Variable", Inter, "Segoe UI", Arial, sans-serif';
const SCALE = 2; // exported pixels per CSS pixel (crisp on phones)

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`400 16px ${FONT}`),
      document.fonts.load(`700 16px ${FONT}`),
      document.fonts.load(`800 16px ${FONT}`),
    ]);
  } catch {
    /* fall back to the system font */
  }
}

function setup(canvas: HTMLCanvasElement, W: number, H: number) {
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  canvas.style.aspectRatio = `${W} / ${H}`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.textBaseline = "top";
  return ctx;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
  return text + "…";
}

function header(ctx: CanvasRenderingContext2D, T: Palette, x: number, title: string, subtitle: string) {
  ctx.fillStyle = T.accent;
  rrect(ctx, x, 30, 6, 40, 3);
  ctx.fill();
  ctx.fillStyle = T.title;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(title, x + 20, 28);
  ctx.fillStyle = T.subtitle;
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText(subtitle, x + 20, 66);
}

function brand(ctx: CanvasRenderingContext2D, T: Palette, W: number, H: number) {
  ctx.font = `800 15px ${FONT}`;
  const tail = "10";
  const wTail = ctx.measureText(tail).width;
  const wHead = ctx.measureText("Joga").width;
  const x = W - 40 - wHead - wTail;
  const y = H - 30;
  ctx.fillStyle = T.subtitle;
  ctx.fillText("Joga", x, y);
  ctx.fillStyle = T.accent;
  ctx.fillText(tail, x + wHead, y);
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export interface TeamsImage {
  event: EventItem;
  teams: (ExportTeam & { color: string | null })[];
  algorithm: string | null;
  spreadCents: number;
  showSkills: boolean;
}

export async function drawTeamsImage(canvas: HTMLCanvasElement, data: TeamsImage, theme: ImageTheme) {
  await fontsReady();
  const T = PALETTES[theme];
  const teams = data.teams;
  const k = Math.max(1, teams.length);
  const cols = Math.min(4, k);
  const gridRows = Math.ceil(k / cols);
  let maxRows = 1;
  for (const t of teams) maxRows = Math.max(maxRows, t.players.length + t.substitutes.length);

  const margin = 40, gap = 24, cardW = 300, headerH = 58, rowH = 34;
  const bodyH = maxRows * rowH + 12;
  const footerH = data.showSkills ? 46 : 8;
  const cardH = headerH + bodyH + footerH;
  const titleH = 112;
  const W = margin * 2 + cols * cardW + (cols - 1) * gap;
  const H = titleH + gridRows * cardH + (gridRows - 1) * gap + margin + 26;

  const ctx = setup(canvas, W, H);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  const parts = [formatDate(data.event.date)];
  if (data.algorithm) parts.push(`Algoritmo: ${data.algorithm}`);
  if (data.showSkills) parts.push(`Diferença entre times: ${fmt2(data.spreadCents / 100)}`);
  header(ctx, T, margin, data.event.title, parts.join("   •   "));

  teams.forEach((team, idx) => {
    const r = Math.floor(idx / cols), c = idx % cols;
    const x = margin + c * (cardW + gap);
    const y = titleH + r * (cardH + gap);
    const color = team.color || T.accent;
    const onColor = readableOn(color);

    rrect(ctx, x + 2, y + 5, cardW, cardH, 18);
    ctx.fillStyle = T.shadow;
    ctx.fill();
    rrect(ctx, x, y, cardW, cardH, 18);
    ctx.fillStyle = T.card;
    ctx.fill();
    ctx.strokeStyle = T.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // coloured header (square bottom corners)
    rrect(ctx, x, y, cardW, headerH, 18);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillRect(x, y + headerH - 18, cardW, 18);
    ctx.fillStyle = onColor;
    ctx.font = `800 20px ${FONT}`;
    const count = `${team.players.length + team.substitutes.length} jogadores`;
    ctx.font = `500 14px ${FONT}`;
    const wCount = ctx.measureText(count).width;
    ctx.globalAlpha = 0.85;
    ctx.fillText(count, x + cardW - 18 - wCount, y + 22);
    ctx.globalAlpha = 1;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(truncate(ctx, team.name, cardW - 50 - wCount), x + 18, y + 18);

    // players (zebra)
    let py = y + headerH + 6;
    const rows = [
      ...team.players
        .slice()
        .sort((a, b) => b.skill - a.skill)
        .map((p) => ({ name: p.name, value: fmt2(p.skill), sub: false })),
      ...team.substitutes.map((cents) => ({ name: "Suplente", value: fmt2(cents / 100), sub: true })),
    ];
    rows.forEach((p, i) => {
      if (i % 2 === 1) {
        ctx.fillStyle = T.zebra;
        ctx.fillRect(x + 6, py - 3, cardW - 12, rowH - 2);
      }
      ctx.fillStyle = p.sub ? T.substitute : T.name;
      let wValue = 0;
      if (data.showSkills) {
        ctx.font = `700 17px ${FONT}`;
        wValue = ctx.measureText(p.value).width;
        ctx.fillText(p.value, x + cardW - 18 - wValue, py + 4);
      }
      ctx.font = p.sub ? `italic 400 17px ${FONT}` : `500 17px ${FONT}`;
      ctx.fillText(truncate(ctx, p.name, cardW - 46 - wValue), x + 18, py + 4);
      py += rowH;
    });

    if (data.showSkills) {
      const fy = y + headerH + bodyH;
      ctx.strokeStyle = T.border;
      ctx.beginPath();
      ctx.moveTo(x + 12, fy);
      ctx.lineTo(x + cardW - 12, fy);
      ctx.stroke();
      const total =
        team.players.reduce((s, p) => s + Math.round(p.skill * 100), 0) +
        team.substitutes.reduce((s, c) => s + c, 0);
      ctx.fillStyle = T.total;
      ctx.font = `700 18px ${FONT}`;
      ctx.fillText("Total", x + 18, fy + 13);
      const tt = fmt2(total / 100);
      const wt = ctx.measureText(tt).width;
      ctx.fillStyle = color;
      ctx.fillText(tt, x + cardW - 18 - wt, fy + 13);
    }
  });
  brand(ctx, T, W, H);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

const MEDALS = ["#eab308", "#a1a1aa", "#c2410c"];

function initialsOf(name: string) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "")).toUpperCase();
}

function drawCanvasCard(
  ctx: CanvasRenderingContext2D,
  r: RankingRow,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  isChampion: boolean,
  isSecond: boolean,
  isThird: boolean,
  theme: ImageTheme
) {
  // Rank badge text & styling
  let badgeColor = "#e4e4e7";
  let badgeText = `${r.rank}º LUGAR`;
  let badgeBg = "rgba(24, 24, 27, 0.85)";
  let badgeBorder = "#52525b";

  if (isChampion) {
    badgeColor = "#fef08a";
    badgeText = "🏆 1º LUGAR — MVP";
    badgeBg = "rgba(180, 83, 9, 0.9)";
    badgeBorder = "#f59e0b";
  } else if (isSecond) {
    badgeColor = "#f1f5f9";
    badgeText = "🥈 2º LUGAR";
    badgeBg = "rgba(71, 85, 105, 0.9)";
    badgeBorder = "#94a3b8";
  } else if (isThird) {
    badgeColor = "#ffedd5";
    badgeText = "🥉 3º LUGAR";
    badgeBg = "rgba(154, 52, 18, 0.9)";
    badgeBorder = "#ea580c";
  }

  // Draw rank badge above card
  const bw = Math.min(w * 0.92, isChampion ? 200 : 160);
  const bh = isChampion ? 26 : 22;
  const bx = x + (w - bw) / 2;
  const by = y - bh - 6;

  rrect(ctx, bx, by, bw, bh, 12);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.strokeStyle = badgeBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = badgeColor;
  ctx.font = `800 ${isChampion ? 11.5 : 10.5}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(badgeText, bx + bw / 2, by + (isChampion ? 6 : 5));

  // Podium Card Glow
  if (isChampion) {
    ctx.save();
    ctx.shadowColor = "rgba(245, 158, 11, 0.45)";
    ctx.shadowBlur = 20;
    rrect(ctx, x, y, w, h, 16);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.restore();
  } else if (isSecond) {
    ctx.save();
    ctx.shadowColor = "rgba(148, 163, 184, 0.35)";
    ctx.shadowBlur = 14;
    rrect(ctx, x, y, w, h, 14);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.restore();
  } else if (isThird) {
    ctx.save();
    ctx.shadowColor = "rgba(234, 88, 12, 0.35)";
    ctx.shadowBlur = 14;
    rrect(ctx, x, y, w, h, 14);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.restore();
  }

  // Card Body (Clipped to rounded rectangle)
  ctx.save();
  rrect(ctx, x, y, w, h, isChampion ? 16 : 14);
  ctx.clip();

  // Draw player card image
  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    ctx.fillStyle = "#18181b";
    ctx.fillRect(x, y, w, h);
  }

  // Localized dark contrast backings (matches PlayerCard.tsx)
  // Top-left
  const radTop = ctx.createRadialGradient(
    x + w * 0.22,
    y + h * 0.22,
    0,
    x + w * 0.22,
    y + h * 0.22,
    w * 0.28
  );
  radTop.addColorStop(0, "rgba(0, 0, 0, 0.65)");
  radTop.addColorStop(0.55, "rgba(0, 0, 0, 0.25)");
  radTop.addColorStop(1, "transparent");
  ctx.fillStyle = radTop;
  ctx.fillRect(x, y, w * 0.5, h * 0.42);

  const isTemplate1 = (r.card_template || "card-template") === "card-template";
  const nameGradY = isTemplate1 ? y + h * 0.67 : y + h * 0.655;
  const statsGradY = isTemplate1 ? y + h * 0.79 : y + h * 0.74;
  const nameY = isTemplate1 ? y + h * 0.67 : y + h * 0.655;
  const lineY = isTemplate1 ? y + h * 0.735 : y + h * 0.69;
  const statsY = isTemplate1 ? y + h * 0.765 : y + h * 0.72;

  // Center (name)
  const radName = ctx.createRadialGradient(
    x + w * 0.5,
    nameGradY,
    0,
    x + w * 0.5,
    nameGradY,
    w * 0.45
  );
  radName.addColorStop(0, "rgba(0, 0, 0, 0.72)");
  radName.addColorStop(0.6, "rgba(0, 0, 0, 0.25)");
  radName.addColorStop(1, "transparent");
  ctx.fillStyle = radName;
  ctx.fillRect(x, nameGradY - h * 0.08, w, h * 0.16);

  // Bottom (stats)
  const radStats = ctx.createRadialGradient(
    x + w * 0.5,
    statsGradY,
    0,
    x + w * 0.5,
    statsGradY,
    w * 0.45
  );
  radStats.addColorStop(0, "rgba(0, 0, 0, 0.7)");
  radStats.addColorStop(0.6, "rgba(0, 0, 0, 0.25)");
  radStats.addColorStop(1, "transparent");
  ctx.fillStyle = radStats;
  ctx.fillRect(x, statsGradY - h * 0.09, w, h * 0.2);

  // Helper for text with crisp outline
  const strokeTextWithShadow = (text: string, tx: number, ty: number, font: string, fill: string) => {
    ctx.font = font;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = fill;
    ctx.fillText(text, tx, ty);
  };

  // Top Left: Score, PTS, Position
  const scoreStr = String(r.score);
  const scoreX = x + w * 0.18;
  const scoreY = y + h * 0.17;

  ctx.textAlign = "center";
  strokeTextWithShadow(scoreStr, scoreX, scoreY, `900 ${Math.round(w * 0.135)}px ${FONT}`, "#ffffff");
  strokeTextWithShadow("PTS", scoreX, scoreY + w * 0.12, `800 ${Math.round(w * 0.045)}px ${FONT}`, "#fcd34d");
  const posStr = (r.position || "MEI").toUpperCase();
  strokeTextWithShadow(posStr, scoreX, scoreY + w * 0.18, `900 ${Math.round(w * 0.055)}px ${FONT}`, "#ffffff");

  // Center: Player Name
  const cleanName = r.name.toUpperCase();
  ctx.textAlign = "center";
  strokeTextWithShadow(
    truncate(ctx, cleanName, w * 0.8),
    x + w / 2,
    nameY,
    `900 ${Math.round(w * 0.065)}px ${FONT}`,
    "#ffffff"
  );

  // Separator Line
  const lineW = isTemplate1 ? w * 0.76 : w * 0.72;
  const lineGrad = ctx.createLinearGradient(x + (w - lineW) / 2, lineY, x + (w + lineW) / 2, lineY);
  lineGrad.addColorStop(0, "transparent");
  lineGrad.addColorStop(0.2, "rgba(255, 215, 0, 0.75)");
  lineGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
  lineGrad.addColorStop(0.8, "rgba(255, 215, 0, 0.75)");
  lineGrad.addColorStop(1, "transparent");
  ctx.fillStyle = lineGrad;
  ctx.fillRect(x + (w - lineW) / 2, lineY, lineW, 1.5);

  // Bottom Stats: Goals & Assists
  const goalsX = x + w * 0.35;
  const assistsX = x + w * 0.65;

  strokeTextWithShadow(String(r.goals), goalsX, statsY, `900 ${Math.round(w * 0.08)}px ${FONT}`, "#ffffff");
  strokeTextWithShadow("GOLS", goalsX, statsY + w * 0.085, `800 ${Math.round(w * 0.04)}px ${FONT}`, "#f1f5f9");

  strokeTextWithShadow(String(r.assists), assistsX, statsY, `900 ${Math.round(w * 0.08)}px ${FONT}`, "#ffffff");
  strokeTextWithShadow("ASSISTS", assistsX, statsY + w * 0.085, `800 ${Math.round(w * 0.04)}px ${FONT}`, "#f1f5f9");

  ctx.textAlign = "left";
  ctx.restore();

  // Border outline around card
  rrect(ctx, x, y, w, h, isChampion ? 16 : 14);
  if (isChampion) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
  } else if (isSecond) {
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
  } else if (isThird) {
    ctx.strokeStyle = "#ea580c";
    ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
  }
  ctx.stroke();
}

export async function drawRankingImage(
  canvas: HTMLCanvasElement,
  event: EventItem,
  rows: RankingRow[],
  theme: ImageTheme
) {
  await fontsReady();

  // Load photos or template fallbacks for all players
  const loadedImages = await Promise.all(
    rows.map((r) => {
      const template = getTemplate(r.card_template || "card-template");
      const url = r.photo_url || template.fullUrl;
      return loadImage(url);
    })
  );

  const T = PALETTES[theme];
  const margin = 40;
  const W = 780;

  // Dimensions for cards
  const topCardW = 260;
  const topCardH = Math.round(topCardW / (757 / 1024)); // ~352px
  const otherCardW = 220;
  const otherCardH = Math.round(otherCardW / (757 / 1024)); // ~298px

  // Vertical layout calculations:
  // Header: 120px
  // 1st place row: badge (26px) + topCardH (352px) + gap = ~415px
  // Other rows: 2 cards per row. Each row takes: badge (22px) + otherCardH (298px) + gap (38px) = ~358px
  const remainingCount = Math.max(0, rows.length - 1);
  const remainingRows = Math.ceil(remainingCount / 2);
  const rowStride = otherCardH + 58;

  let H = 130 + 60; // minimum
  if (rows.length === 1) {
    H = 130 + topCardH + 70 + 60;
  } else if (rows.length > 1) {
    H = 130 + topCardH + 70 + remainingRows * rowStride + 60;
  }

  const ctx = setup(canvas, W, H);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  header(ctx, T, margin, `Ranking — ${event.title}`, `${formatDate(event.date)}   •   ${rows.length} jogadores`);

  if (rows.length === 0) {
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = T.subtitle;
    ctx.textAlign = "center";
    ctx.fillText("Nenhum jogador classificado no momento.", W / 2, 220);
    ctx.textAlign = "left";
    brand(ctx, T, W, H);
    return;
  }

  // 1st place card: Centered taking full row!
  const firstRowY = 160;
  const firstX = (W - topCardW) / 2;
  drawCanvasCard(
    ctx,
    rows[0],
    loadedImages[0],
    firstX,
    firstRowY,
    topCardW,
    topCardH,
    true,
    false,
    false,
    theme
  );

  // Remaining cards (2 per row):
  const col1X = Math.round(W / 4 - otherCardW / 2); // ~85px
  const col2X = Math.round((3 * W) / 4 - otherCardW / 2); // ~475px
  const startOthersY = firstRowY + topCardH + 60;

  for (let idx = 1; idx < rows.length; idx++) {
    const pairIndex = idx - 1;
    const rowNum = Math.floor(pairIndex / 2);
    const isCol2 = pairIndex % 2 === 1;

    // Center single card on last row if odd number of remaining cards
    let cardX = isCol2 ? col2X : col1X;
    if (!isCol2 && idx === rows.length - 1) {
      cardX = (W - otherCardW) / 2;
    }

    const cardY = startOthersY + rowNum * rowStride;
    const isSecond = idx === 1;
    const isThird = idx === 2;

    drawCanvasCard(
      ctx,
      rows[idx],
      loadedImages[idx],
      cardX,
      cardY,
      otherCardW,
      otherCardH,
      false,
      isSecond,
      isThird,
      theme
    );
  }

  ctx.fillStyle = T.subtitle;
  ctx.font = `500 12.5px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, RANKING_FORMULA, W - margin * 2 - 90), margin, H - 30);
  brand(ctx, T, W, H);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
