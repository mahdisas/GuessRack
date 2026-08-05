/**
 * Regenerates the PNG icons and the social share card from SVG sources.
 *   node scripts/make-images.mjs
 * Only needs re-running when the branding changes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const WORDS = [
  ['WOLF', 1], ['PIZZA', 1], ['CACTUS', 0], ['ROCKET', 1],
  ['ANCHOR', 1], ['VOLCANO', 1], ['DRUM', 1], ['FEATHER', 0],
  ['MIRROR', 0], ['CANOE', 1], ['HONEY', 1], ['ZIPPER', 1],
];

/** The 3x4 rack on the right of the share card, a couple of tiles knocked down. */
function rack() {
  const cardW = 92;
  const cardH = 126;
  const gap = 16;
  const originX = 690;
  const originY = 116;
  let out = '';

  WORDS.forEach(([word, standing], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = originX + col * (cardW + gap);
    const y = originY + row * (cardH + gap);

    if (standing) {
      out += `
        <g>
          <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="10" fill="#f6f3ea"/>
          <rect x="${x + 6}" y="${y + 6}" width="${cardW - 12}" height="${cardH - 12}" rx="6"
                fill="none" stroke="#0d9488" stroke-width="2"/>
          <text x="${x + cardW / 2}" y="${y + cardH / 2 + 6}" font-family="${FONT}"
                font-size="${word.length > 5 ? 13 : 16}" font-weight="700" fill="#161a24"
                text-anchor="middle">${word}</text>
        </g>`;
    } else {
      // knocked down: a flattened tile lying at the foot of its slot
      out += `
        <g opacity="0.85">
          <path d="M${x + 6} ${y + cardH} L${x + cardW - 6} ${y + cardH}
                   L${x + cardW} ${y + cardH - 22} L${x} ${y + cardH - 22} Z"
                fill="#26324f"/>
          <rect x="${x + 14}" y="${y + cardH - 17}" width="${cardW - 28}" height="4" rx="2"
                fill="#5eead4" fill-opacity="0.5"/>
        </g>`;
    }
  });
  return out;
}

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#1d2949"/>
      <stop offset="0.5" stop-color="#111a30"/>
      <stop offset="1" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5eead4"/>
      <stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect y="624" width="1200" height="6" fill="url(#rule)"/>

  <text x="80" y="228" font-family="${FONT}" font-size="86" font-weight="800" fill="#eef2ff"
        letter-spacing="-2">Guess<tspan fill="#5eead4">Rack</tspan></text>

  <text x="80" y="292" font-family="${FONT}" font-size="30" font-weight="600" fill="#a9b6d6">
    Two-player word guessing, in 3D
  </text>

  <text x="80" y="368" font-family="${FONT}" font-size="23" fill="#8e9ab8">
    One rack of 24 words. You each hold a secret
  </text>
  <text x="80" y="404" font-family="${FONT}" font-size="23" fill="#8e9ab8">
    word from it. Ask yes/no questions, knock down
  </text>
  <text x="80" y="440" font-family="${FONT}" font-size="23" fill="#8e9ab8">
    what it can't be, and call it first.
  </text>

  <rect x="80" y="486" width="232" height="46" rx="23" fill="#5eead4"/>
  <text x="196" y="516" font-family="${FONT}" font-size="20" font-weight="700" fill="#04211d"
        text-anchor="middle">Free · No signup</text>

  ${rack()}
</svg>`;

async function main() {
  await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, 'og-image.png'));

  const favicon = await fs.readFile(path.join(PUBLIC, 'favicon.svg'));
  for (const [name, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    await sharp(favicon, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(PUBLIC, name));
  }

  console.log('Wrote og-image.png, apple-touch-icon.png, icon-192.png, icon-512.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
