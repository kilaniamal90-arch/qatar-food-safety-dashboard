import { useCallback, useEffect, useState } from "react"

import type { ManagedEvent } from "@/admin/types"
import type { YearFilter } from "@/data/rawData"
import { toIsoDateLocal } from "@/lib/dateIsoLocal"
import { supabase } from "@/lib/supabase"

const EVENT_SELECT =
  "id,title_ar,title_en,description_ar,description_en,area_name_ar,area_name_en,event_date,year,icon,is_active"

type EventRowDb = {
  id: unknown
  title_ar?: string | null
  title_en?: string | null
  description_ar?: string | null
  description_en?: string | null
  area_name_ar?: string | null
  area_name_en?: string | null
  event_date?: string | null
  year?: number | null
  icon?: string | null
  is_active?: boolean | null
}

export function mapEventRow(row: EventRowDb): ManagedEvent {
  return {
    id: String(row.id),
    titleAr: String(row.title_ar ?? ""),
    titleEn: String(row.title_en ?? ""),
    descriptionAr: row.description_ar ?? null,
    descriptionEn: row.description_en ?? null,
    areaNameAr: row.area_name_ar ?? null,
    areaNameEn: row.area_name_en ?? null,
    eventDate: String(row.event_date ?? "").slice(0, 10),
    year: Number(row.year ?? 0),
    icon: String(row.icon ?? "🎯"),
    isActive: Boolean(row.is_active),
  }
}

export function useAllEvents() {
  const [data, setData] = useState<ManagedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .order("event_date", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map((r) => mapEventRow(r as EventRowDb)))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, refetch }
}

export function useUpcomingEventsForYear(year: YearFilter) {
  const [data, setData] = useState<ManagedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const y = Number.parseInt(year, 10)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const today = toIsoDateLocal(new Date())
    const { data: rows, error: err } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .eq("year", y)
      .eq("is_active", true)
      .gte("event_date", today)
      .order("event_date", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map((r) => mapEventRow(r as EventRowDb)))
    }
    setLoading(false)
  }, [y])

  useEffect(() => {
    void load()
  }, [load, reloadToken, year])

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, refetch }
}

/** All active events for a dashboard year (past + upcoming), newest date first — for the public modal. */
export function useAllYearEventsForYear(year: YearFilter) {
  const [data, setData] = useState<ManagedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const y = Number.parseInt(year, 10)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: rows, error: err } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .eq("year", y)
      .eq("is_active", true)
      .order("event_date", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map((r) => mapEventRow(r as EventRowDb)))
    }
    setLoading(false)
  }, [y])

  useEffect(() => {
    void load()
  }, [load, reloadToken, year])

  const refetch = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, refetch }
}
