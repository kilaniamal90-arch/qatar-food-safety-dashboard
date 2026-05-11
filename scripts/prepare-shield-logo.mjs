/**
 * Builds public/logo.png from the full app-icon asset: shield-only region, no text,
 * black letterboxing -> cream, centered on square canvas (no black).
 *
 * Usage: node scripts/prepare-shield-logo.mjs [path-to-source.png]
 */
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const REPO_SOURCE = path.join(root, "public", "logo-source.png")
const FALLBACK_CURSOR_ASSET = path.resolve(
  "C:/Users/claude/.cursor/projects/c-My-Apps-qatar-food-safety-dashboard/assets/c__Users_claude_AppData_Roaming_Cursor_User_workspaceStorage_e8de1ae5543ec6faf37180ffb4312d4e_images_logo-b96971fb-de78-4701-bd12-eb5e76e625be.png",
)

/** Rows to keep from top (excludes English + Arabic lines). */
const TEXT_CROP_HEIGHT = 688
/** Pixels with luminance below this become cream (letterboxing). */
const BLACK_THRESH = 14
const CREAM = { r: 255, g: 248, b: 220 }
const MASTER_SIZE = 1024
/** Max side for shield art inside master (rest is cream margin). */
const MASTER_ART_MAX = 880

function replaceBlackWithCream({ data, info }) {
  const { width, height, channels } = info
  const out = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const j = (y * width + x) * 4
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      const lum = r + g + b
      if (lum <= BLACK_THRESH) {
        r = CREAM.r
        g = CREAM.g
        b = CREAM.b
      }
      out[j] = r
      out[j + 1] = g
      out[j + 2] = b
      out[j + 3] = 255
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
}

async function main() {
  const input = path.resolve(process.argv[2] || (existsSync(REPO_SOURCE) ? REPO_SOURCE : FALLBACK_CURSOR_ASSET))
  if (!existsSync(input)) {
    console.error("prepare-shield-logo: missing source", input)
    process.exit(1)
  }

  const meta = await sharp(input).metadata()
  const srcW = meta.width ?? 0
  const srcH = meta.height ?? 0
  if (!srcW || !srcH) {
    console.error("prepare-shield-logo: could not read dimensions")
    process.exit(1)
  }

  const cropH = Math.min(TEXT_CROP_HEIGHT, srcH)
  let pipeline = sharp(input).extract({ left: 0, top: 0, width: srcW, height: cropH })

  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const trimmed = await replaceBlackWithCream({ data, info }).png().toBuffer()

  const w = info.width
  const h = info.height
  const side = Math.min(w, h)
  const left = Math.round((w - side) / 2)
  const top = Math.round((h - side) / 2)

  const rgb = await sharp(trimmed)
    .extract({ left, top, width: side, height: side })
    .resize(MASTER_ART_MAX, MASTER_ART_MAX, {
      fit: "contain",
      background: { ...CREAM, alpha: 1 },
      position: "centre",
    })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: { ...CREAM, alpha: 1 },
    },
  })
    .composite([{ input: rgb, left: Math.round((MASTER_SIZE - MASTER_ART_MAX) / 2), top: Math.round((MASTER_SIZE - MASTER_ART_MAX) / 2) }])
    .png()
    .toFile(path.join(root, "public", "logo.png"))

  console.log("wrote public/logo.png from", input)
}

await main()
