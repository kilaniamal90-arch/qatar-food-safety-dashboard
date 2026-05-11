/**
 * Generates PWA / Apple touch icons from public/logo.png (shield on cream).
 * Run automatically via npm prebuild.
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const src = path.join(root, "public", "logo.png")

const CREAM = { r: 255, g: 248, b: 220, alpha: 1 }

if (!existsSync(src)) {
  console.error("generate-pwa-icons: missing public/logo.png")
  process.exit(1)
}

/**
 * @param {string} file
 * @param {number} size
 * @param {number} padding px on each side
 */
async function renderIcon(file, size, padding) {
  const inner = size - 2 * padding
  if (inner < 1) {
    console.error("generate-pwa-icons: inner size < 1 for", file)
    process.exit(1)
  }

  const fg = await sharp(src)
    .ensureAlpha()
    .resize(inner, inner, {
      fit: "contain",
      background: CREAM,
      position: "centre",
    })
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([{ input: fg, left: padding, top: padding }])
    .png()
    .toFile(path.join(root, "public", file))

  console.log("wrote", file, `${size}x${size} pad=${padding}`)
}

await renderIcon("pwa-64.png", 64, 8)
await renderIcon("pwa-192.png", 192, 24)
await renderIcon("pwa-512.png", 512, 64)
await renderIcon("apple-touch-icon.png", 180, 20)
await renderIcon("pwa-512-maskable.png", 512, 80)
