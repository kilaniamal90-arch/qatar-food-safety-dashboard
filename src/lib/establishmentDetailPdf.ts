import { jsPDF } from "jspdf"

import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import type { Establishment, InspectionRating } from "@/data/rawData"
import type { EstablishmentInspectionDetail } from "@/lib/supabase/remoteDataset"

/** Helvetica PDF: strip Arabic (shows as ???) — use "—" instead. */
function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "—"
  const hasArabic = /[\u0600-\u06FF]/.test(text)
  if (hasArabic) return "—"
  return text.trim() || "—"
}

const BRAND = {
  burgundy: "8B1538",
  gold: "D4AF37",
} as const

const ALT_ROW_GRAY = "F9F9F9"
const FIELD_BG = "F5F5F5"

/** Rating column text (English labels; Helvetica only). */
const RATING_TEXT_RGB: Record<InspectionRating, [number, number, number]> = {
  Excellent: [22, 163, 74],
  "Very Good": [132, 204, 22],
  Good: [13, 148, 136],
  Fair: [234, 88, 12],
  Poor: [220, 38, 38],
  "Very Poor": [153, 27, 27],
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim()
  const n = Number.parseInt(h.length === 6 ? h : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function nonEmpty(v: unknown): v is string {
  if (v == null) return false
  return String(v).trim() !== "" && String(v).trim() !== "—"
}

function formatGeneratedAt(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const y = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${day}/${mo}/${y} ${hh}:${mm}`
}

function inspectorForPdf(ins: EstablishmentInspectionDetail): string {
  const en = ins.inspectorNameEn.trim()
  if (en && en !== "—") return sanitizeForPdf(en)
  return "—"
}

function ratingEn(ins: EstablishmentInspectionDetail): string {
  const en = ins.ratingNameEn.trim()
  if (en) return en
  return ins.rating
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () =>
      resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height })
    img.onerror = () => reject(new Error("Chart image failed to load"))
    img.src = dataUrl
  })
}

/** Top burgundy band with establishment name (page 1). */
function drawEstablishmentHeader(
  doc: jsPDF,
  pageW: number,
  margin: number,
  br: [number, number, number],
  titleName: string,
): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  const titleLines = doc.splitTextToSize(titleName, pageW - 2 * margin)
  const bandH = Math.max(22, 10 + titleLines.length * 5.8 + 9)
  doc.setFillColor(br[0], br[1], br[2])
  doc.rect(0, 0, pageW, bandH, "F")
  doc.setTextColor(255, 255, 255)
  doc.text(titleLines, margin, 12)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  const subY = 12 + titleLines.length * 5.8 + 3
  doc.text("Qatar Food Safety · Ministry of Public Health", margin, subY)
  doc.setTextColor(0, 0, 0)
  return bandH + 7
}

function drawSectionHeading(
  doc: jsPDF,
  margin: number,
  y: number,
  gold: [number, number, number],
  title: string,
): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(gold[0], gold[1], gold[2])
  doc.text(title, margin, y)
  doc.setTextColor(0, 0, 0)
  return y + 6.5
}

function drawGoldDivider(
  doc: jsPDF,
  margin: number,
  y: number,
  pageW: number,
  gold: [number, number, number],
): number {
  doc.setDrawColor(gold[0], gold[1], gold[2])
  doc.setLineWidth(0.35)
  doc.line(margin, y, pageW - margin, y)
  return y + 6
}

type FieldRow = { label: string; value: string }

const INNER_PAD = 2.5
const BLOCK_ROW_GAP = 5.5
const LABEL_SIZE = 6.5
const VALUE_SIZE = 10.2

function measureFieldBlockHeight(doc: jsPDF, f: FieldRow, innerW: number): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(LABEL_SIZE)
  const labelLines = doc.splitTextToSize(f.label.toUpperCase(), innerW)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(VALUE_SIZE)
  const valueLines = doc.splitTextToSize(f.value, innerW)
  return (
    INNER_PAD +
    labelLines.length * 3.2 +
    2.2 +
    valueLines.length * 4.3 +
    INNER_PAD
  )
}

function drawOneFieldBlock(
  doc: jsPDF,
  fx: number,
  fy: number,
  fw: number,
  f: FieldRow,
  fieldBgRgb: [number, number, number],
  gold: [number, number, number],
  textMuted: [number, number, number],
): number {
  const innerW = fw - 2 * INNER_PAD
  const blockH = measureFieldBlockHeight(doc, f, innerW)

  doc.setFillColor(fieldBgRgb[0], fieldBgRgb[1], fieldBgRgb[2])
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.1)
  doc.rect(fx, fy, fw, blockH, "FD")

  let ty = fy + INNER_PAD + 2.5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(LABEL_SIZE)
  doc.setTextColor(gold[0], gold[1], gold[2])
  const labelLines = doc.splitTextToSize(f.label.toUpperCase(), innerW)
  doc.text(labelLines, fx + INNER_PAD, ty)
  ty += labelLines.length * 3.2 + 2
  doc.setFont("helvetica", "normal")
  doc.setFontSize(VALUE_SIZE)
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
  const valueLines = doc.splitTextToSize(f.value, innerW)
  doc.text(valueLines, fx + INNER_PAD, ty)
  doc.setTextColor(0, 0, 0)
  return blockH
}

function drawFooters(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  gold: [number, number, number],
  generatedLabel: string,
): void {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const y = pageH - 7
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(75, 75, 75)
    doc.text(`Page ${i} of ${total}`, margin, y)
    doc.setTextColor(gold[0], gold[1], gold[2])
    doc.text(generatedLabel, pageW - margin, y, { align: "right" })
    doc.setTextColor(0, 0, 0)
  }
}

/**
 * English-only establishment detail PDF (A4 portrait). Burgundy + gold theme.
 * Aims for a compact 2-page layout (info + inspections on page 1 when possible;
 * chart + notes share one page). Long inspection tables may add extra pages.
 */
export async function exportEstablishmentDetailPdf(
  establishment: Establishment,
  inspections: EstablishmentInspectionDetail[],
  areaNameEn: string,
  chartImageDataUrl: string | null,
  note: string | null,
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12
  const contentW = pageW - 2 * margin
  const footerReserve = 13
  const maxY = pageH - footerReserve

  const br = hexRgb(BRAND.burgundy)
  const gold = hexRgb(BRAND.gold)
  const grayStripe = hexRgb(ALT_ROW_GRAY)
  const fieldBgRgb = hexRgb(FIELD_BG)
  const textMuted: [number, number, number] = [55, 55, 55]

  const generatedAt = new Date()
  const generatedLabel = `Generated ${formatGeneratedAt(generatedAt)}`
  const titleNameRaw = establishment.nameEn?.trim() || establishment.name
  const titleName = sanitizeForPdf(titleNameRaw)

  const basicFields: FieldRow[] = [
    { label: "Area", value: sanitizeForPdf(areaNameEn.trim() || undefined) },
    { label: "Location", value: sanitizeForPdf(establishment.location?.trim()) },
    { label: "Activity", value: sanitizeForPdf(establishment.activityType?.trim()) },
    {
      label: "Operational Status",
      value: sanitizeForPdf(establishment.operationalStatus),
    },
  ]
  if (nonEmpty(establishment.phone)) {
    basicFields.push({
      label: "Phone",
      value: sanitizeForPdf(String(establishment.phone).trim()),
    })
  }
  if (nonEmpty(establishment.personInCharge)) {
    basicFields.push({
      label: "Person in Charge",
      value: sanitizeForPdf(String(establishment.personInCharge).trim()),
    })
  }
  if (nonEmpty(establishment.email)) {
    basicFields.push({
      label: "Email",
      value: sanitizeForPdf(String(establishment.email).trim()),
    })
  }
  if (nonEmpty(establishment.serviceHours)) {
    basicFields.push({
      label: "Service Hours",
      value: sanitizeForPdf(String(establishment.serviceHours).trim()),
    })
  }

  const regFields: FieldRow[] = []
  if (nonEmpty(establishment.crNumber)) {
    regFields.push({
      label: "CR Number",
      value: sanitizeForPdf(String(establishment.crNumber).trim()),
    })
  }
  if (nonEmpty(establishment.nameInEms)) {
    regFields.push({
      label: "Name in EMS",
      value: sanitizeForPdf(String(establishment.nameInEms).trim()),
    })
  }
  if (establishment.nbOutlets != null) {
    regFields.push({
      label: "Number of Outlets",
      value: sanitizeForPdf(String(establishment.nbOutlets)),
    })
  }

  const colGap = 5
  const colW = (contentW - colGap) / 2

  const newPageInfoContinued = (): number => {
    doc.addPage()
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(gold[0], gold[1], gold[2])
    doc.text("Establishment details (continued)", margin, margin + 4)
    doc.setTextColor(0, 0, 0)
    return margin + 12
  }

  const drawFieldPairRows = (list: FieldRow[], yRef: { y: number }) => {
    let i = 0
    while (i < list.length) {
      const left = list[i]!
      const right = list[i + 1]
      const innerW = colW - 2 * INNER_PAD
      const hL = measureFieldBlockHeight(doc, left, innerW)
      const hR = right ? measureFieldBlockHeight(doc, right, innerW) : 0
      const rowH = Math.max(hL, hR)

      if (yRef.y + rowH + BLOCK_ROW_GAP > maxY) {
        yRef.y = newPageInfoContinued()
      }
      const top = yRef.y
      drawOneFieldBlock(doc, margin, top, colW, left, fieldBgRgb, gold, textMuted)
      if (right) {
        drawOneFieldBlock(
          doc,
          margin + colW + colGap,
          top,
          colW,
          right,
          fieldBgRgb,
          gold,
          textMuted,
        )
      }
      yRef.y = top + rowH + BLOCK_ROW_GAP
      i += right ? 2 : 1
    }
  }

  let y = drawEstablishmentHeader(doc, pageW, margin, br, titleName)
  y = drawSectionHeading(doc, margin, y, gold, "Basic Information") + 2

  const yCursor = { y }
  drawFieldPairRows(basicFields, yCursor)
  y = yCursor.y

  if (regFields.length > 0) {
    y += 1
    if (y + 14 > maxY) {
      y = newPageInfoContinued()
    }
    y = drawGoldDivider(doc, margin, y, pageW, gold)
    y = drawSectionHeading(doc, margin, y, gold, "Registration") + 2
    yCursor.y = y
    drawFieldPairRows(regFields, yCursor)
    y = yCursor.y
  }

  y += 4
  if (y + 16 > maxY) {
    y = newPageInfoContinued()
  }
  y = drawSectionHeading(doc, margin, y, gold, "Inspection History") + 4

  const headers = ["Date", "Rating", "Inspector", "Reference", "Task Type", "Note"]
  const colWTable = [20, 26, 32, 22, 26, contentW - 20 - 26 - 32 - 22 - 26]

  const drawInspectionTableHeader = (startY: number): number => {
    const headerRowH = 8.5
    let x = margin
    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    for (let c = 0; c < headers.length; c++) {
      doc.setFillColor(br[0], br[1], br[2])
      doc.setDrawColor(40, 40, 40)
      doc.setLineWidth(0.1)
      doc.rect(x, startY, colWTable[c]!, headerRowH, "FD")
      const lines = doc.splitTextToSize(headers[c]!, colWTable[c]! - 2)
      doc.text(lines, x + 1, startY + 5)
      x += colWTable[c]!
    }
    doc.setTextColor(0, 0, 0)
    doc.setFont("helvetica", "normal")
    return headerRowH
  }

  const inspectionContinueY = (): number => {
    doc.addPage()
    let yy = margin
    yy = drawSectionHeading(doc, margin, yy, gold, "Inspection History (continued)") + 5
    return yy
  }

  if (inspections.length > 0) {
    let hh = drawInspectionTableHeader(y)
    y += hh + 1

    const baseRowH = 5
    const cellFont = 6.8

    for (let i = 0; i < inspections.length; i++) {
      const ins = inspections[i]!
      const dateStr = sanitizeForPdf(
        formatInspectionDateDdMmYyyy(ins.inspectionDate, "Unknown Date"),
      )
      const ratingStr = sanitizeForPdf(ratingEn(ins))
      const inspectorStr = inspectorForPdf(ins)
      const refStr = sanitizeForPdf(ins.refNumber?.trim())
      const taskStr = sanitizeForPdf(ins.taskType?.trim())
      const noteStr = sanitizeForPdf(ins.note?.trim())

      const cells = [dateStr, ratingStr, inspectorStr, refStr, taskStr, noteStr]
      const lineChunks: string[][] = []
      let maxLines = 1
      for (let c = 0; c < cells.length; c++) {
        const chunk = doc.splitTextToSize(cells[c]!, colWTable[c]! - 2)
        lineChunks.push(chunk)
        maxLines = Math.max(maxLines, chunk.length)
      }
      const rowH = Math.max(baseRowH, 2.4 + maxLines * 2.9)

      if (y + rowH > maxY) {
        y = inspectionContinueY()
        hh = drawInspectionTableHeader(y)
        y += hh + 1
      }

      const rowTop = y
      const stripe: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : grayStripe
      let x = margin
      const ratingRgb = RATING_TEXT_RGB[ins.rating]

      for (let c = 0; c < cells.length; c++) {
        doc.setFillColor(stripe[0], stripe[1], stripe[2])
        doc.setDrawColor(90, 90, 90)
        doc.setLineWidth(0.08)
        doc.rect(x, rowTop, colWTable[c]!, rowH, "FD")

        doc.setFontSize(cellFont)
        if (c === 1) {
          doc.setFont("helvetica", "bold")
          doc.setTextColor(ratingRgb[0], ratingRgb[1], ratingRgb[2])
        } else {
          doc.setFont("helvetica", "normal")
          doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        }
        doc.text(lineChunks[c]!, x + 1, rowTop + 3.6)
        x += colWTable[c]!
      }

      doc.setFont("helvetica", "normal")
      doc.setTextColor(0, 0, 0)
      y += rowH
    }
  } else {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text("No inspections recorded.", margin, y)
    y += 6
  }

  const noteTrim = note?.trim() ?? ""
  const noteForPdf = sanitizeForPdf(noteTrim)
  const hasChart = Boolean(chartImageDataUrl)
  const hasNotes = noteTrim.length > 0 && noteForPdf !== "—"

  if (hasChart || hasNotes) {
    doc.addPage()
    y = margin

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    const subLines = doc.splitTextToSize(titleName, pageW - 2 * margin)
    const bandH = Math.max(12, 6 + subLines.length * 4 + 6)
    doc.setFillColor(br[0], br[1], br[2])
    doc.rect(0, 0, pageW, bandH, "F")
    doc.setTextColor(255, 255, 255)
    doc.text(subLines, margin, 6)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text("Qatar Food Safety · Ministry of Public Health", margin, 6 + subLines.length * 4)
    doc.setTextColor(0, 0, 0)
    y = bandH + 6

    if (hasChart && chartImageDataUrl) {
      y = drawSectionHeading(doc, margin, y, gold, "Ratings Trend") + 3
      const fmt = chartImageDataUrl.toLowerCase().includes("image/jpeg") ? "JPEG" : "PNG"
      try {
        const { w: iw, h: ih } = await loadImageSize(chartImageDataUrl)
        const maxW = contentW
        let maxH = pageH - y - footerReserve - (hasNotes ? 40 : 0)
        if (maxH < 40) maxH = pageH - y - footerReserve
        const scale = Math.min(maxW / iw, maxH / ih, 1)
        const drawW = iw * scale
        const drawH = ih * scale
        const ix = margin + (contentW - drawW) / 2
        doc.addImage(chartImageDataUrl, fmt, ix, y, drawW, drawH)
        y += drawH + 8
      } catch {
        doc.setFontSize(9)
        doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        doc.text("Chart could not be embedded.", margin, y + 6)
        y += 12
      }
    }

    if (hasNotes) {
      if (y + 20 > maxY) {
        doc.addPage()
        y = margin + 4
      }
      y = drawSectionHeading(doc, margin, y, gold, "Notes") + 4
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      for (const para of noteForPdf.split(/\r?\n/)) {
        const lines = doc.splitTextToSize(para || " ", contentW)
        for (const line of lines) {
          if (y + 5.5 > maxY) {
            doc.addPage()
            y = margin + 4
            doc.setFont("helvetica", "normal")
            doc.setFontSize(10)
            doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          }
          doc.text(line, margin, y)
          y += 5.2
        }
        y += 2
      }
    }
  }

  drawFooters(doc, pageW, pageH, margin, gold, generatedLabel)

  const stamp = generatedAt.toISOString().slice(0, 10)
  const slug =
    titleNameRaw
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 48) || "establishment"
  doc.save(`establishment-detail-${slug}-${stamp}.pdf`)
}
