import * as THREE from 'three';

const FACE_W = 512;
const FACE_H = 708; // matches the card's 1.05 : 1.45 aspect

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Break a word into lines that fit the face at the given font size. */
function layout(ctx, text, maxWidth, size) {
  ctx.font = `800 ${size}px 'Segoe UI', system-ui, sans-serif`;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return { lines, widest };
}

function finish(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The readable face of a card: parchment panel with the word set as large as
 * it can be without touching the frame.
 */
export function makeWordTexture(word, { accent = '#0d9488', big = false, label = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_W;
  canvas.height = FACE_H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, FACE_H);
  grad.addColorStop(0, '#fbf9f2');
  grad.addColorStop(1, '#e4dfd0');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, FACE_W, FACE_H, 46);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = big ? 14 : 10;
  roundRect(ctx, 26, 26, FACE_W - 52, FACE_H - 52, 30);
  ctx.stroke();

  // corner ticks, a little card-stock detail
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  for (const [cx, cy] of [[60, 60], [FACE_W - 60, 60], [60, FACE_H - 60], [FACE_W - 60, FACE_H - 60]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (label) {
    ctx.fillStyle = accent;
    ctx.font = "700 40px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '6px';
    ctx.fillText(label.toUpperCase(), FACE_W / 2, 96);
    ctx.letterSpacing = '0px';
  }

  const maxWidth = FACE_W - 130;
  let size = big ? 108 : 96;
  let result = layout(ctx, word, maxWidth, size);
  while ((result.widest > maxWidth || result.lines.length > 3) && size > 30) {
    size -= 4;
    result = layout(ctx, word, maxWidth, size);
  }

  ctx.fillStyle = '#161a24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = size * 1.12;
  const top = FACE_H / 2 - ((result.lines.length - 1) * lineHeight) / 2;
  result.lines.forEach((line, i) => ctx.fillText(line, FACE_W / 2, top + i * lineHeight));

  return finish(canvas);
}

/** Vertical gradient used as the scene backdrop. */
export function makeBackdropTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1d2949');
  grad.addColorStop(0.45, '#111a30');
  grad.addColorStop(1, '#05070d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  return finish(canvas);
}

/** The reverse of every card — what you see once a card is knocked down. */
export function makeBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_W;
  canvas.height = FACE_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1b2440';
  roundRect(ctx, 0, 0, FACE_W, FACE_H, 46);
  ctx.fill();

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.55)';
  ctx.lineWidth = 8;
  roundRect(ctx, 30, 30, FACE_W - 60, FACE_H - 60, 28);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(94, 234, 212, 0.18)';
  ctx.lineWidth = 4;
  for (let i = -FACE_H; i < FACE_W; i += 34) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + FACE_H, FACE_H);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(94, 234, 212, 0.8)';
  ctx.font = "800 78px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', FACE_W / 2, FACE_H / 2);

  return finish(canvas);
}
