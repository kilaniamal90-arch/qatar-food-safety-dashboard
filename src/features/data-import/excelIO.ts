import * as XLSX from "xlsx"

import { uniquifyExcelHeaders } from "@/features/data-import/columnHeaderNormalize"
import { cleanExcelColumnHeader } from "@/features/data-import/columnMap"

export const EST_TEMPLATE_SHEET = "Establishments"
export const STATUS_TEMPLATE_SHEET = "Status History"
export const INSP_TEMPLATE_SHEET = "Inspections"

/** Header order matches official import specification (three sheets). */
const templateEstablishmentsRows: (string | number)[][] = [
  [
    "Establishment name",
    "Establishment name In EMS",
    "CR",
    "Account Status In EMS",
    "Main Area",
    "Location",
    "Type of activity",
    "phone",
    "person in charge",
    "email",
    "service hours",
    "note",
    "photo",
    "NB of outlets under hotel CR",
  ],
  [
    "Example Restaurant",
    "Example Restaurant EMS",
    "12345",
    "Active Account",
    "Doha",
    "21st Street",
    "Restaurant",
    "+974 1234 5678",
    "Mohamed Hassan",
    "contact@example.rest",
    "08:00–22:00",
    "Allergen board visible at entrance",
    "https://example.invalid/establishment-photo.jpg",
    1,
  ],
]

const templateStatusHistoryRows: (string | number)[][] = [
  ["Establishment name", "Year", "Operational Status"],
  ["Example Restaurant", 2024, "Open"],
]

const templateInspectionRows: (string | number)[][] = [
  [
    "Establishment Name",
    "Inspection date",
    "Inspection Rate",
    "Reference number",
    "Inspector in charge",
    "Type of task",
    "note",
  ],
  [
    "Example Restaurant",
    "15/04/2024",
    "Excellent",
    "FP/24/12345",
    "Ahmed Mohamed",
    "Routine hygiene inspection",
    "",
  ],
]

export function downloadImportTemplate(filename = "Qatar_Food_Safety_Template.xlsx") {
  const wb = XLSX.utils.book_new()
  const wsEst = XLSX.utils.aoa_to_sheet(templateEstablishmentsRows)
  const wsStatus = XLSX.utils.aoa_to_sheet(templateStatusHistoryRows)
  const wsInsp = XLSX.utils.aoa_to_sheet(templateInspectionRows)
  XLSX.utils.book_append_sheet(wb, wsEst, EST_TEMPLATE_SHEET)
  XLSX.utils.book_append_sheet(wb, wsStatus, STATUS_TEMPLATE_SHEET)
  XLSX.utils.book_append_sheet(wb, wsInsp, INSP_TEMPLATE_SHEET)
  XLSX.writeFile(wb, filename)
}

function findSheet(workbook: XLSX.WorkBook, preferred: string, fallbackIdx: number): string | undefined {
  const lower = preferred.toLowerCase()
  const named = workbook.SheetNames.find((n) => n.toLowerCase().includes(lower))
  if (named) return named
  return workbook.SheetNames[fallbackIdx]
}

function sheetToCleanRecords(sheet: XLSX.WorkSheet): {
  columns: string[]
  rows: Record<string, unknown>[]
} {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  })

  if (!matrix?.length) return { columns: [], rows: [] }

  const headerRow = Array.isArray(matrix[0]) ? matrix[0] : []
  const cleaned = headerRow.map((cell) => cleanExcelColumnHeader(cell))
  const columns = uniquifyExcelHeaders(cleaned)

  const rows: Record<string, unknown>[] = []
  for (let r = 1; r < matrix.length; r++) {
    const rawLine = matrix[r]
    const line: unknown[] = Array.isArray(rawLine) ? rawLine : []
    const record: Record<string, unknown> = {}
    let hasValue = false
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const key = columns[cIdx]!
      let val: unknown = cIdx < line.length ? line[cIdx] : ""
      if (val === undefined) val = ""
      record[key] = val
      if (val instanceof Date && !Number.isNaN(val.getTime())) {
        hasValue = true
      } else if (val !== "" && val != null && String(val).trim() !== "") {
        hasValue = true
      }
    }
    if (hasValue) rows.push(record)
  }

  return { columns, rows }
}

export type ParsedWorkbookTables = {
  establishmentColumns: string[]
  establishmentsRows: Record<string, unknown>[]
  statusHistoryColumns: string[]
  statusHistoryRows: Record<string, unknown>[]
  inspectionsColumns: string[]
  inspectionsRows: Record<string, unknown>[]
}

export async function readExcelTables(file: File): Promise<ParsedWorkbookTables> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })

  const estName = findSheet(workbook, "establish", 0)
  const statusName = findSheet(workbook, "status", 1)
  const inspName = findSheet(workbook, "inspect", 2)

  if (!estName || !statusName || !inspName) {
    throw new Error("MISSING_SHEETS")
  }

  const estSheet = workbook.Sheets[estName]
  const statusSheet = workbook.Sheets[statusName]
  const inspSheet = workbook.Sheets[inspName]
  if (!estSheet || !statusSheet || !inspSheet) {
    throw new Error("MISSING_SHEETS")
  }

  const establishmentsParsed = sheetToCleanRecords(estSheet)
  const statusParsed = sheetToCleanRecords(statusSheet)
  const inspectionsParsed = sheetToCleanRecords(inspSheet)

  return {
    establishmentColumns: establishmentsParsed.columns,
    establishmentsRows: establishmentsParsed.rows,
    statusHistoryColumns: statusParsed.columns,
    statusHistoryRows: statusParsed.rows,
    inspectionsColumns: inspectionsParsed.columns,
    inspectionsRows: inspectionsParsed.rows,
  }
}
