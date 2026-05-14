import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"

import type { InspectionRating, OperationalStatus } from "@/data/rawData"

/** Helvetica PDF: strip Arabic (renders as ???) — use "—" instead. */
function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "—"
  const hasArabic = /[\u0600-\u06FF]/.test(text)
  if (hasArabic) return "—"
  return text.trim() || "—"
}

/** Values written to cells (styling uses `statusKey` / `ratingKey`). */
export type EstablishmentsExportDataRow = {
  rowNum: number
  name: string
  area: string
  location: string
  status: string
  lastInspection: string
  daysAgo: string
  rating: string
  inspectionCount: string
}

export type EstablishmentsExportRow = EstablishmentsExportDataRow & {
  statusKey: OperationalStatus
  ratingKey: InspectionRating | null
}

export type EstablishmentsExportColumnTitles = Record<
  keyof EstablishmentsExportDataRow,
  string
>

const EXPORT_KEYS: (keyof EstablishmentsExportDataRow)[] = [
  "rowNum",
  "name",
  "area",
  "location",
  "status",
  "lastInspection",
  "daysAgo",
  "rating",
  "inspectionCount",
]

const exportStamp = () => new Date().toISOString().slice(0, 10)

const BRAND = {
  burgundy: "8B1538",
  gold: "D4AF37",
} as const

const ALT_ROW_GRAY = "F9FAFB"

const STATUS_FILL_LIGHT: Record<OperationalStatus, string> = {
  Open: "DCFCE7",
  Closed: "FEE2E2",
  "Temporary Closed": "FFEDD5",
  "Open Soon": "F3E8FF",
}

const RATING_FILL: Record<InspectionRating, string> = {
  Excellent: "10B981",
  "Very Good": "84CC16",
  Good: "FBBF24",
  Fair: "FB923C",
  Poor: "F87171",
  "Very Poor": "DC2626",
}

const RATING_TEXT_ARGB: Record<InspectionRating, string> = {
  Excellent: "FF111827",
  "Very Good": "FF111827",
  Good: "FF111827",
  Fair: "FF111827",
  Poor: "FF111827",
  "Very Poor": "FFFFFFFF",
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF333333" } },
  left: { style: "thin", color: { argb: "FF333333" } },
  bottom: { style: "thin", color: { argb: "FF333333" } },
  right: { style: "thin", color: { argb: "FF333333" } },
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim()
  const n = Number.parseInt(h.length === 6 ? h : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function pdfStatusLightFill(s: OperationalStatus): [number, number, number] {
  return hexRgb(STATUS_FILL_LIGHT[s])
}

function pdfRatingFill(r: InspectionRating): [number, number, number] {
  return hexRgb(RATING_FILL[r])
}

function pdfRatingTextRgb(r: InspectionRating): [number, number, number] {
  const a = RATING_TEXT_ARGB[r]
  const hex = a.replace(/^FF/i, "")
  const n = Number.parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Minimum column widths (Excel “character” units). */
const COL_MIN: Record<keyof EstablishmentsExportDataRow, number> = {
  rowNum: 5,
  name: 24,
  area: 12,
  location: 18,
  status: 16,
  lastInspection: 14,
  daysAgo: 12,
  rating: 16,
  inspectionCount: 11,
}

export async function exportEstablishmentsExcel(
  rows: EstablishmentsExportRow[],
  colTitles: EstablishmentsExportColumnTitles,
  baseFileName = "establishments",
) {
  const stamp = exportStamp()
  const wb = new ExcelJS.Workbook()
  wb.creator = "Qatar Food Safety"
  const ws = wb.addWorksheet("Establishments", {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false }],
  })

  const headerTexts = EXPORT_KEYS.map((k) => colTitles[k])
  const headerRow = ws.addRow(headerTexts)
  headerRow.height = 22
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${BRAND.burgundy}` },
    }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.border = thinBorder
    const key = EXPORT_KEYS[colNumber - 1]!
    const titleLen = String(headerTexts[colNumber - 1] ?? "").length
    const maxDataLen = rows.reduce((m, r) => {
      const v = r[key]
      const len = typeof v === "number" ? String(v).length : String(v ?? "").length
      return Math.max(m, len)
    }, titleLen)
    ws.getColumn(colNumber).width = Math.min(
      52,
      Math.max(COL_MIN[key], maxDataLen * 1.05 + 1.5),
    )
  })

  const statusColIdx = EXPORT_KEYS.indexOf("status") + 1
  const ratingColIdx = EXPORT_KEYS.indexOf("rating") + 1

  rows.forEach((row, idx) => {
    const excelRow = ws.addRow(EXPORT_KEYS.map((k) => row[k]))
    excelRow.height = 18
    const fillArgb =
      idx % 2 === 0 ? `FFFFFFFF` : `FF${ALT_ROW_GRAY}`
    excelRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fillArgb },
      }
      cell.font = { size: 10, color: { argb: "FF111827" } }
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true }
      cell.border = thinBorder

      if (colNumber === statusColIdx) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${STATUS_FILL_LIGHT[row.statusKey]}` },
        }
      }
      if (colNumber === ratingColIdx && row.ratingKey) {
        const rk = row.ratingKey
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${RATING_FILL[rk]}` },
        }
        cell.font = {
          size: 10,
          bold: true,
          color: { argb: RATING_TEXT_ARGB[rk] },
        }
      }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${baseFileName}-${stamp}.xlsx`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Landscape PDF — Qatar MOPH burgundy + gold; status/rating fills match Excel. */
export function exportEstablishmentsPdf(
  rows: EstablishmentsExportRow[],
  colTitles: EstablishmentsExportColumnTitles,
  headerLine1: string,
  headerLine2: string,
  baseFileName = "establishments",
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  let y = margin

  const [brR, brG, brB] = hexRgb(BRAND.burgundy)
  const [gR, gG, gB] = hexRgb(BRAND.gold)

  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(brR, brG, brB)
  doc.text(sanitizeForPdf(headerLine1), margin, y)
  y += 5.5

  doc.setDrawColor(gR, gG, gB)
  doc.setLineWidth(0.35)
  doc.line(margin, y, pageW - margin, y)
  y += 3.5

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(75, 75, 75)
  doc.text(sanitizeForPdf(headerLine2), margin, y)
  y += 6

  const headers = EXPORT_KEYS.map((k) => sanitizeForPdf(colTitles[k]))
  const colW = [9, 48, 22, 36, 28, 24, 20, 26, 18]
  const tableW = colW.reduce((a, b) => a + b, 0)
  const x0 = margin + Math.max(0, (pageW - 2 * margin - tableW) / 2)

  const statusIdx = EXPORT_KEYS.indexOf("status")
  const ratingIdx = EXPORT_KEYS.indexOf("rating")

  const headerRowH = 8
  const drawTableHeader = (startY: number) => {
    let x = x0
    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.2)
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]!
      doc.setFillColor(brR, brG, brB)
      doc.setDrawColor(40, 40, 40)
      doc.setLineWidth(0.12)
      doc.rect(x, startY - headerRowH + 1.5, colW[i]!, headerRowH, "FD")
      const lines = doc.splitTextToSize(h, colW[i]! - 2)
      doc.text(lines, x + 1.2, startY - 1.2)
      x += colW[i]!
    }
    doc.setTextColor(0, 0, 0)
    doc.setFont("helvetica", "normal")
  }

  drawTableHeader(y)
  y += headerRowH + 1

  const baseRowH = 5.2
  const fontSize = 6.8

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const cells = EXPORT_KEYS.map((k) => sanitizeForPdf(String(r[k] ?? "")))

    let maxLines = 1
    const lineChunks: string[][] = []
    for (let c = 0; c < cells.length; c++) {
      const chunk = doc.splitTextToSize(cells[c]!, colW[c]! - 2)
      lineChunks.push(chunk)
      maxLines = Math.max(maxLines, chunk.length)
    }
    const rowH = Math.max(baseRowH, 2.2 + maxLines * 2.9)

    if (y + rowH > pageH - margin - 10) {
      doc.addPage()
      y = margin + 8
      drawTableHeader(y)
      y += headerRowH + 1
    }

    const rowTop = y - rowH + 2
    let x = x0
    const stripeRgb: [number, number, number] =
      i % 2 === 0 ? [255, 255, 255] : hexRgb(ALT_ROW_GRAY)

    for (let c = 0; c < cells.length; c++) {
      doc.setDrawColor(55, 55, 55)
      doc.setLineWidth(0.1)

      let fill: [number, number, number] = stripeRgb
      let txtRgb: [number, number, number] = [17, 24, 39]

      if (c === statusIdx) fill = pdfStatusLightFill(r.statusKey)
      if (c === ratingIdx && r.ratingKey) {
        fill = pdfRatingFill(r.ratingKey)
        txtRgb = pdfRatingTextRgb(r.ratingKey)
      }

      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.rect(x, rowTop, colW[c]!, rowH, "FD")

      doc.setFontSize(fontSize)
      doc.setFont("helvetica", c === ratingIdx && r.ratingKey ? "bold" : "normal")
      doc.setTextColor(txtRgb[0], txtRgb[1], txtRgb[2])
      const lines = lineChunks[c]!
      doc.text(lines, x + 1, rowTop + 3)
      x += colW[c]!
    }

    doc.setFont("helvetica", "normal")
    y += rowH
  }

  const stamp = exportStamp()
  doc.setFontSize(8)
  doc.setTextColor(brR, brG, brB)
  doc.setFont("helvetica", "bold")
  doc.text(`Ministry of Public Health — Qatar Food Safety`, margin, pageH - 8)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(gR, gG, gB)
  doc.text(`${stamp}`, pageW - margin, pageH - 8, { align: "right" })

  doc.save(`${baseFileName}-${stamp}.pdf`)
}
