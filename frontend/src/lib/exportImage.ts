/* PNG exports drawn on a canvas, in a light and a dark variant (port of
   team-balance's gerarImagem, extended with a ranking card). */
import type { EventItem, RankingRow } from "../types";
import { formatDate, fmt2, readableOn } from "./format";
import type { ExportTeam } from "./exportText";
import { RANKING_FORMULA } from "./exportText";

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

export async function drawRankingImage(
  canvas: HTMLCanvasElement,
  event: EventItem,
  rows: RankingRow[],
  theme: ImageTheme
) {
  await fontsReady();
  const photos = await Promise.all(rows.map((r) => (r.photo_url ? loadImage(r.photo_url) : Promise.resolve(null))));
  const T = PALETTES[theme];
  const margin = 40, rowH = 58, tableTop = 150;
  const W = 820;
  const H = tableTop + Math.max(1, rows.length) * rowH + 70;
  const ctx = setup(canvas, W, H);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);
  header(ctx, T, margin, `Ranking — ${event.title}`, `${formatDate(event.date)}   •   ${rows.length} jogadores`);

  // column titles
  const colG = W - margin - 250, colA = colG + 54, colBar = colA + 50;
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = T.subtitle;
  ctx.fillText("JOGADOR", margin + 106, tableTop - 26);
  ctx.fillText("G", colG + 8, tableTop - 26);
  ctx.fillText("A", colA + 8, tableTop - 26);
  ctx.fillText("PONTOS", colBar, tableTop - 26);

  // card
  rrect(ctx, margin, tableTop - 8, W - margin * 2, Math.max(1, rows.length) * rowH + 16, 18);
  ctx.fillStyle = T.card;
  ctx.fill();
  ctx.strokeStyle = T.border;
  ctx.stroke();

  rows.forEach((r, i) => {
    const y = tableTop + i * rowH;
    if (i % 2 === 1) {
      ctx.fillStyle = T.zebra;
      ctx.fillRect(margin + 1, y, W - margin * 2 - 2, rowH);
    }
    const cy = y + rowH / 2;
    // rank badge
    if (r.rank <= 3) {
      ctx.beginPath();
      ctx.arc(margin + 34, cy, 15, 0, Math.PI * 2);
      ctx.fillStyle = MEDALS[r.rank - 1];
      ctx.fill();
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.fillStyle = T.subtitle;
    }
    ctx.font = `800 15px ${FONT}`;
    const rank = String(r.rank);
    ctx.fillText(rank, margin + 34 - ctx.measureText(rank).width / 2, cy - 8);

    // avatar
    const ax = margin + 76, ar = 18;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, cy, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const photo = photos[i];
    if (photo) {
      ctx.drawImage(photo, ax - ar, cy - ar, ar * 2, ar * 2);
    } else {
      ctx.fillStyle = T.track;
      ctx.fillRect(ax - ar, cy - ar, ar * 2, ar * 2);
      ctx.fillStyle = T.name;
      ctx.font = `700 13px ${FONT}`;
      const ini = initialsOf(r.name);
      ctx.fillText(ini, ax - ctx.measureText(ini).width / 2, cy - 7);
    }
    ctx.restore();
    if (r.team_color) {
      ctx.beginPath();
      ctx.arc(ax, cy, ar + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = r.team_color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // name + position/team
    const nameX = margin + 106, nameW = colG - nameX - 16;
    ctx.fillStyle = T.name;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(truncate(ctx, r.name, nameW), nameX, cy - 17);
    ctx.fillStyle = T.subtitle;
    ctx.font = `500 12.5px ${FONT}`;
    const meta = [r.position, r.team_name].filter(Boolean).join("  ·  ") || "—";
    ctx.fillText(truncate(ctx, meta, nameW), nameX, cy + 4);

    // goals / assists
    ctx.fillStyle = T.name;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(String(r.goals), colG + 8, cy - 9);
    ctx.fillText(String(r.assists), colA + 8, cy - 9);

    // score bar
    const barW = W - margin - 24 - colBar - 44;
    rrect(ctx, colBar, cy - 4, barW, 8, 4);
    ctx.fillStyle = T.track;
    ctx.fill();
    if (r.score > 0) {
      rrect(ctx, colBar, cy - 4, Math.max(8, (barW * r.score) / 100), 8, 4);
      ctx.fillStyle = T.accent;
      ctx.fill();
    }
    ctx.fillStyle = T.title;
    ctx.font = `800 16px ${FONT}`;
    const score = String(r.score);
    ctx.fillText(score, W - margin - 18 - ctx.measureText(score).width, cy - 9);
  });
  ctx.fillStyle = T.subtitle;
  ctx.font = `500 12.5px ${FONT}`;
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
