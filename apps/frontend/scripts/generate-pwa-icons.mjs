/**
 * Generates the PWA icon set for Veerha WMS into apps/frontend/public/.
 *
 * The artwork is the app's own brand mark: a lucide `Warehouse` glyph in brand
 * teal on the dark-navy sidebar colour (see --sidebar-background / --sidebar-primary
 * in src/app/index.css).
 *
 * `sharp` is deliberately NOT a dependency of the frontend package — it is a heavy
 * native module and these icons only need regenerating when the brand changes.
 * Run it in a throwaway container instead:
 *
 *   docker run --rm \
 *     -v /abs/path/to/wms-production/apps/frontend:/fe -w /tmp node:20 \
 *     sh -c "npm i --no-save sharp >/dev/null 2>&1 && node /fe/scripts/generate-pwa-icons.mjs /fe/public"
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Resolve `sharp` from the *cwd* first, so the throwaway-container recipe above
// (npm i --no-save sharp in /tmp, script mounted elsewhere) works.
const requireFromCwd = createRequire(join(process.cwd(), 'noop.js'));
const requireFromHere = createRequire(import.meta.url);
let sharp;
try {
  sharp = requireFromCwd('sharp');
} catch {
  sharp = requireFromHere('sharp');
}

const OUT_DIR = resolve(process.argv[2] || 'public');
mkdirSync(OUT_DIR, { recursive: true });

// Brand colours, derived from the HSL custom properties in src/app/index.css
const NAVY = '#0f1729'; // --sidebar-background: 222 47% 11%
const TEAL = '#30b5a6'; // --sidebar-primary:    173 58% 45%

/**
 * lucide-react `Warehouse` icon, 24x24 viewBox, drawn centred and scaled.
 * @param {number} size    canvas size in px
 * @param {number} inset   fraction of the canvas the glyph should occupy (0..1)
 * @param {number|null} radius corner radius in px, or null for full-bleed (maskable/apple)
 */
function iconSvg(size, inset, radius) {
  const glyph = size * inset;
  const scale = glyph / 24;
  const offset = (size - glyph) / 2;
  const stroke = 2; // lucide default, in 24x24 units

  const bg =
    radius === null
      ? `<rect width="${size}" height="${size}" fill="${NAVY}"/>`
      : `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${NAVY}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g transform="translate(${offset} ${offset}) scale(${scale})"
     fill="none" stroke="${TEAL}" stroke-width="${stroke}"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/>
    <path d="M6 18h12"/>
    <path d="M6 14h12"/>
    <path d="M6 10h12v12H6z"/>
  </g>
</svg>`;
}

const targets = [
  // [filename, size, glyph inset, corner radius]
  ['pwa-64x64.png', 64, 0.62, 12],
  ['pwa-192x192.png', 192, 0.58, 36],
  ['pwa-512x512.png', 512, 0.58, 96],
  // Maskable: full-bleed background, glyph well inside the centre 80% safe zone.
  ['pwa-maskable-512x512.png', 512, 0.44, null],
  // iOS applies its own mask/rounding, so ship a full-bleed square.
  ['apple-touch-icon.png', 180, 0.58, null],
  ['favicon-96x96.png', 96, 0.62, 18],
];

for (const [name, size, inset, radius] of targets) {
  const svg = iconSvg(size, inset, radius);
  // Render the SVG oversampled (high density) then downsample to the exact
  // target size, so strokes stay crisp instead of aliasing at 1x.
  const png = await sharp(Buffer.from(svg), { density: 288 })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(OUT_DIR, name), png);
  const meta = await sharp(png).metadata();
  console.log(`${name.padEnd(28)} ${meta.width}x${meta.height} ${meta.format} ${png.length}b`);
}

// Scalable favicon for browsers that prefer it.
writeFileSync(join(OUT_DIR, 'favicon.svg'), iconSvg(64, 0.62, 12));
console.log('favicon.svg                 written');
