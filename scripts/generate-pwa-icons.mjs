/**
 * Generates PWA / Apple touch icons from public/logo.png.
 * Run automatically via npm prebuild.
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const src = path.join(root, "public", "logo.png")

if (!existsSync(src)) {
  console.error("generate-pwa-icons: missing public/logo.png")
  process.exit(1)
}

async function out(file, width, height = width, extendMaskable = false) {
  let pipeline
  if (extendMaskable && width === 512) {
    const inner = Math.round(width * 0.62)
    const img = await sharp(src)
      .ensureAlpha()
      .resize(inner, inner, { fit: "cover", position: "centre" })
      .toBuffer()
    const pad = Math.round((width - inner) / 2)
    pipeline = sharp(img).extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
  } else {
    pipeline = sharp(src).ensureAlpha().resize(width, height, {
      fit: "cover",
      position: "centre",
    })
  }
  await pipeline.png().toFile(path.join(root, "public", file))
  console.log("wrote", file)
}

await out("pwa-64.png", 64)
await out("pwa-192.png", 192)
await out("pwa-512.png", 512)
await out("pwa-512-maskable.png", 512, 512, true)
await out("apple-touch-icon.png", 180)
