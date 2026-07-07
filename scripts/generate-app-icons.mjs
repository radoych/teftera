// Regenerates all app icons from the master logo. Run on demand:
//   node scripts/generate-app-icons.mjs
import sharp from 'sharp';

const BG = '#121316';
const SRC = 'assets/logo.png'; // white anthemion, transparent, 2146x1808

async function compose(size, logoWidthRatio, background, out) {
  const logo = await sharp(SRC)
    .resize({ width: Math.round(size * logoWidthRatio) })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out);
  console.log('wrote', out);
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

await compose(1024, 0.62, BG, 'assets/images/icon.png');
// Android adaptive safe zone is the middle 66% — keep the mark inside it.
await compose(1024, 0.55, transparent, 'assets/images/android-icon-foreground.png');
await compose(1024, 0.55, transparent, 'assets/images/android-icon-monochrome.png');
await compose(1024, 0.8, transparent, 'assets/images/splash-icon.png');
await compose(48, 0.75, BG, 'assets/images/favicon.png');
