import type { SupabaseClient } from "@supabase/supabase-js"

/** Insert or update the period row for a rating (`rating_id` is unique when configured in DB). */
export async function upsertReinspectionPeriod(
  supabase: SupabaseClient,
  ratingId: string,
  days: number,
): Promise<{ error: Error | null }> {
  const { data: existing, error: selErr } = await supabase
    .from("reinspection_periods")
    .select("id")
    .eq("rating_id", ratingId)
    .maybeSingle()

  if (selErr) return { error: new Error(selErr.message) }

  const row = existing as { id?: string } | null
  if (row?.id) {
    const { error } = await supabase
      .from("reinspection_periods")
      .update({ days })
      .eq("id", row.id)
    return { error: error ? new Error(error.message) : null }
  }

  const { error } = await supabase
    .from("reinspection_periods")
    .insert({ rating_id: ratingId, days })
  return { error: error ? new Error(error.message) : null }
}

export async function deleteReinspectionPeriodsForRating(
  supabase: SupabaseClient,
  ratingId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("reinspection_periods")
    .delete()
    .eq("rating_id", ratingId)
  return { error: error ? new Error(error.message) : null }
}
