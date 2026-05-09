import ExcelJS from "exceljs"

import type { TableRow } from "@/data/establishmentsTable"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import type { InspectionRating } from "@/data/rawData"

const HEADER_BGR = "FF8B1538"
const HEADER_FONT_WHITE = "FFFFFFFF"

const BODY_FONT_DEFAULT = "FF000000"
const ROW_ODD_BGR = "FFFFFFFF"
const ROW_EVEN_BGR = "FFFDF2F4"

const COL_WIDTHS: readonly number[] = [5, 35, 15, 18, 12, 15, 15]

const DAYS_COL_IDX = 5
const RATING_COL_IDX = 6

function buildFollowUpExcelHeaders(localeArabic: boolean): string[] {
  return localeArabic
    ? [
        "#",
        "اسم المنشأة",
        "المنطقة",
        "آخر تفتيش",
        "مضى (أيام)",
        "التقييم",
        "الحالة",
      ]
    : [
        "#",
        "Establishment Name",
        "Area",
        "Last Inspection",
        "Days Since",
        "Rating",
        "Status",
      ]
}

function excelEstablishmentNameForExport(row: TableRow): string {
  const en = row.establishmentNameEn?.trim()
  return en !== undefined && en !== "" ? en : row.establishmentName
}

function excelAreaForExport(row: TableRow, localeArabic: boolean): string {
  if (localeArabic) {
    return row.area
  }
  const en = row.areaNameEn?.trim()
  return en !== undefined && en !== "" ? en : row.area
}

const RATING_TEXT_ARGB: Record<InspectionRating, string> = {
  Excellent: "FF10B981",
  "Very Good": "FF84CC16",
  Good: "FFFBBF24",
  Fair: "FFFB923C",
  Poor: "FFF87171",
  "Very Poor": "FFDC2626",
}

function daysSinceFontArgb(daysAgo: number | null): string | undefined {
  if (daysAgo == null) return undefined
  if (daysAgo < 30) return "FF10B981"
  if (daysAgo <= 60) return "FFFB923C"
  return "FFDC2626"
}

function triggerExcelBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener noreferrer"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function sanitizeExcelSheetTitle(title: string): string {
  return title.replace(/[\]\\[*?:/]/gu, "-").slice(0, 31).trim() || "Sheet1"
}

function solidFill(bgArgb: string): ExcelJS.Fill {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: bgArgb },
  }
}

const headerFill = solidFill(HEADER_BGR)

export type ExportStatusFollowUpOptions = Readonly<{
  localeArabic: boolean
  rowRatingText: (row: TableRow) => string
  rowStatusText: (row: TableRow) => string
  filename: string
  sheetName: string
}>

/** Export dashboard status follow-up rows (already filtered upstream), with styled Excel formatting. */
export async function exportFilteredStatusFollowUpToXlsx(
  rows: TableRow[],
  options: ExportStatusFollowUpOptions,
): Promise<void> {
  if (rows.length === 0) return

  const headers = buildFollowUpExcelHeaders(options.localeArabic)
  const sheetNameSafe = sanitizeExcelSheetTitle(options.sheetName)

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetNameSafe, {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 1 }],
  })

  for (let c = 0; c < COL_WIDTHS.length; c++) {
    worksheet.getColumn(c + 1).width = COL_WIDTHS[c]!
  }

  const headerRow = worksheet.addRow(headers)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = { bold: true, color: { argb: HEADER_FONT_WHITE }, size: 11 }
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    }
    cell.border = {
      bottom: { style: "thin", color: { argb: HEADER_BGR } },
    }
  })

  rows.forEach((row, idx) => {
    const seq = idx + 1
    const lastInspText = formatInspectionDateDdMmYyyy(
      row.lastInspectionDate,
      "—",
    )
    const daysValue: number | "" = row.daysAgo ?? ""

    const dataRow = worksheet.addRow([
      seq,
      excelEstablishmentNameForExport(row),
      excelAreaForExport(row, options.localeArabic),
      lastInspText,
      daysValue,
      options.rowRatingText(row),
      options.rowStatusText(row),
    ])

    const rowFillArgb = idx % 2 === 0 ? ROW_ODD_BGR : ROW_EVEN_BGR
    const rowFill = solidFill(rowFillArgb)

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = rowFill
      cell.font = { size: 11, color: { argb: BODY_FONT_DEFAULT } }
      const isEstablishmentCol = colNumber === 2
      cell.alignment = {
        vertical: "middle",
        horizontal: isEstablishmentCol ? "left" : "center",
        wrapText: isEstablishmentCol,
      }

      const daysArgb = daysSinceFontArgb(row.daysAgo)
      if (colNumber === DAYS_COL_IDX && daysArgb != null) {
        cell.font = { bold: false, color: { argb: daysArgb }, size: 11 }
      }

      const ratingArgb =
        row.rating != null ? RATING_TEXT_ARGB[row.rating] : undefined
      if (colNumber === RATING_COL_IDX && ratingArgb != null) {
        cell.font = { bold: false, color: { argb: ratingArgb }, size: 11 }
      }
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  triggerExcelBlobDownload(blob, options.filename)
}
