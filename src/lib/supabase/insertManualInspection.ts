import type { SupabaseClient } from "@supabase/supabase-js"

import { toIsoDateLocal } from "@/lib/dateIsoLocal"

export type InsertManualInspectionInput = {
  establishmentId: string
  inspectionDate: Date
  ratingId: string
  inspectorId: string
  referenceNumber: string | null
  notes: string | null
  taskType?: string | null
  /** Rows from `years` with at least `id` and calendar `year`. */
  years: readonly { id: string; year: number }[]
}

export async function insertManualInspection(
  supabase: SupabaseClient,
  input: InsertManualInspectionInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const calYear = input.inspectionDate.getFullYear()
  const yearRow = input.years.find((y) => y.year === calYear)
  if (!yearRow) {
    return {
      ok: false,
      message: `No year record for ${calYear}. Add this year in admin.`,
    }
  }

  const row = {
    establishment_id: input.establishmentId,
    inspection_date: toIsoDateLocal(input.inspectionDate),
    rating_id: input.ratingId,
    inspector_id: input.inspectorId,
    reference_number: input.referenceNumber,
    notes: input.notes,
    heatmap_url: null as string | null,
    year_id: yearRow.id,
    task_type:
      input.taskType != null && String(input.taskType).trim() !== ""
        ? String(input.taskType).trim()
        : null,
  }

  const { error } = await supabase.from("inspections").insert(row)

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true }
}
