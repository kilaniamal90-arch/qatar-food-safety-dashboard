import {
  cleanExcelColumnHeader,
  normalizeColumnHeaderForMatch,
} from "@/features/data-import/columnHeaderNormalize"

/** Normalized header → internal field id (establishments worksheet). */

export type EstablishmentImportField =
  | "establishmentName"
  | "nameInEms"
  | "crNumber"
  | "accountStatusEms"
  | "area"
  | "location"
  | "activityType"
  | "phone"
  | "personInCharge"
  | "email"
  | "serviceHours"
  | "establishmentNote"
  | "establishmentPhoto"
  | "nbOutlets"
  | null

/** Status history worksheet (annual operational status per establishment). */
export type StatusHistoryImportField =
  | "establishmentName"
  | "year"
  | "operationalStatus"
  | null

/** Inspection worksheet field ids */

export type InspectionImportField =
  | "establishmentName"
  | "inspectionDate"
  | "rating"
  | "inspector"
  | "referenceNumber"
  | "notes"
  | "taskType"
  | null

export type ColumnMapping = {
  fileColumn: string
  systemField: string | null
}

/** Establishments worksheet — note maps to establishmentNote (not inspections “notes”). */
const SMART_MAP_ESTABLISHMENTS: Record<string, string> = {
  "establishment name": "establishmentName",
  "اسم المنشأة": "establishmentName",

  "establishment name in ems": "nameInEms",

  cr: "crNumber",
  "رقم السجل": "crNumber",
  "commercial registration": "crNumber",

  "account status in ems": "accountStatusEms",
  "account status": "accountStatusEms",

  "main area": "area",
  area: "area",
  المنطقة: "area",

  location: "location",
  الموقع: "location",

  "type of activity": "activityType",
  activity: "activityType",
  "نوع النشاط": "activityType",

  phone: "phone",
  tel: "phone",
  هاتف: "phone",

  "person in charge": "personInCharge",

  email: "email",
  e_mail: "email",

  "service hours": "serviceHours",
  hours: "serviceHours",

  note: "establishmentNote",
  notes: "establishmentNote",
  remarks: "establishmentNote",

  photo: "establishmentPhoto",
  image: "establishmentPhoto",

  "nb of outlets under hotel cr": "nbOutlets",
  outlets: "nbOutlets",
}

const SMART_MAP_STATUS_HISTORY: Record<string, string> = {
  "establishment name": "establishmentName",
  "اسم المنشأة": "establishmentName",

  year: "year",
  سنة: "year",

  "operational status": "operationalStatus",
  "الحالة التشغيلية": "operationalStatus",
}

const SMART_MAP_INSPECTIONS: Record<string, string> = {
  "establishment name": "establishmentName",
  "اسم المنشأة": "establishmentName",

  "inspection date": "inspectionDate",
  date: "inspectionDate",
  "تاريخ التفتيش": "inspectionDate",
  تاريخ: "inspectionDate",

  "inspection rate": "rating",
  rate: "rating",
  rating: "rating",
  التقييم: "rating",

  "inspector in charge": "inspector",
  inspector: "inspector",
  المفتش: "inspector",

  "reference number": "referenceNumber",
  reference: "referenceNumber",
  المرجع: "referenceNumber",

  "type of task": "taskType",
  "نوع المهمة": "taskType",
  task: "taskType",

  note: "notes",
  notes: "notes",
  ملاحظات: "notes",
}

/** Re-export for mapping UI labels (readable header text). */
export { cleanExcelColumnHeader }

export function normalizeHeader(raw: string) {
  return normalizeColumnHeaderForMatch(raw)
}

export type ImportSheetKind = "establishments" | "inspections" | "statusHistory"

export function autoMapColumns(
  fileColumns: string[],
  sheet: ImportSheetKind,
): ColumnMapping[] {
  const dict =
    sheet === "establishments"
      ? SMART_MAP_ESTABLISHMENTS
      : sheet === "statusHistory"
        ? SMART_MAP_STATUS_HISTORY
        : SMART_MAP_INSPECTIONS
  return fileColumns.map((col) => {
    const key = normalizeHeader(col)
    const match = dict[key]
    return {
      fileColumn: col,
      systemField: match ?? null,
    }
  })
}

export const IGNORE_VALUE = "__ignore__"
