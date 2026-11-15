// Regenerates features/reports/logo.ts — the PDF report header logo — from the
// master logo, downscaled. The report renders it at height 40px, so a 320px-wide
// PNG is sharp even on 3x screens / print while costing ~14 KB of source instead
// of the ~285 KB the full 2146x1808 master put in the JS bundle. Run on demand:
//   node scripts/generate-report-logo.mjs
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'assets/logo.png'; // white anthemion, transparent, 2146x1808
const OUT = 'features/reports/logo.ts';
const WIDTH = 320;

const png = await sharp(SRC)
  .resize({ width: WIDTH })
  // A white mark on transparent needs few colours: 32 keeps the anti-aliased
  // edges smooth and brings the PNG to ~10 KB.
  .png({ compressionLevel: 9, palette: true, colors: 32, effort: 10 })
  .toBuffer();

const source = `// Generated from assets/logo.png by scripts/generate-report-logo.mjs — do not edit by hand.
// ${WIDTH}px wide; rendered at height 40px in the report header.
export const TEFTERA_LOGO_DATA_URI =
  'data:image/png;base64,${png.toString('base64')}';
`;

writeFileSync(OUT, source);
console.log(`wrote ${OUT} (${png.length} bytes png, ${source.length} bytes source)`);
