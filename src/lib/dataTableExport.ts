import * as XLSX from "xlsx"
import { jsPDF } from "jspdf"

/** Columns for Establishments page export (Excel locale-aware, PDF always built with English row data). */
export type EstablishmentsExportRow = {
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

export type EstablishmentsExportColumnTitles = Record<
  keyof EstablishmentsExportRow,
  string
>

const exportStamp = () => new Date().toISOString().slice(0, 10)

export function exportEstablishmentsExcel(
  rows: EstablishmentsExportRow[],
  colTitles: EstablishmentsExportColumnTitles,
  baseFileName = "establishments",
) {
  const stamp = exportStamp()
  const data = rows.map((r) => ({
    [colTitles.rowNum]: r.rowNum,
    [colTitles.name]: r.name,
    [colTitles.area]: r.area,
    [colTitles.location]: r.location,
    [colTitles.status]: r.status,
    [colTitles.lastInspection]: r.lastInspection,
    [colTitles.daysAgo]: r.daysAgo,
    [colTitles.rating]: r.rating,
    [colTitles.inspectionCount]: r.inspectionCount,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Establishments")
  XLSX.writeFile(wb, `${baseFileName}-${stamp}.xlsx`)
}

/** Landscape PDF with MOPH burgundy header row; `rows` should already use English labels. */
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

  doc.setFontSize(11)
  doc.setTextColor(139, 21, 56)
  doc.text(headerLine1, margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(headerLine2, margin, y)
  y += 7
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(7)

  const headers = [
    colTitles.rowNum,
    colTitles.name,
    colTitles.area,
    colTitles.location,
    colTitles.status,
    colTitles.lastInspection,
    colTitles.daysAgo,
    colTitles.rating,
    colTitles.inspectionCount,
  ]

  const colW = [7, 42, 20, 34, 24, 26, 22, 22, 18]
  const tableW = colW.reduce((a, b) => a + b, 0)
  let x0 = margin + Math.max(0, (pageW - 2 * margin - tableW) / 2)

  const drawHeader = (startY: number) => {
    let x = x0
    doc.setFillColor(139, 21, 56)
    doc.setTextColor(255, 255, 255)
    doc.rect(x, startY - 4, tableW, 6, "F")
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]!
      doc.text(h, x + 1, startY, { maxWidth: colW[i]! - 2 })
      x += colW[i]!
    }
    doc.setTextColor(0, 0, 0)
  }

  drawHeader(y)
  y += 8

  const rowH = 5
  for (let i = 0; i < rows.length; i++) {
    if (y + rowH > pageH - margin - 8) {
      doc.addPage()
      y = margin + 10
      drawHeader(y)
      y += 8
    }
    const r = rows[i]!
    const cells = [
      String(r.rowNum),
      r.name,
      r.area,
      r.location,
      r.status,
      r.lastInspection,
      r.daysAgo,
      r.rating,
      r.inspectionCount,
    ]
    let x = x0
    for (let c = 0; c < cells.length; c++) {
      doc.text(String(cells[c]).slice(0, 120), x + 1, y, {
        maxWidth: colW[c]! - 2,
      })
      x += colW[c]!
    }
    y += rowH
  }

  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  const stamp = exportStamp()
  doc.text(
    `Ministry of Public Health — Qatar Food Safety • ${stamp}`,
    margin,
    pageH - 6,
  )

  doc.save(`${baseFileName}-${stamp}.pdf`)
}
