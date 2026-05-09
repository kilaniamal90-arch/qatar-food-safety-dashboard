import { useMemo } from "react"

import { useAuth } from "@/auth/AuthContext"
import { useAreas } from "@/hooks/useAreas"

/** Areas shown in filters and forms: all for admin; only `user_areas` assignments otherwise. */
export function useFilterAreas() {
  const { data: allAreas, loading, error, refetch } = useAreas()
  const { user, isAdmin } = useAuth()

  const data = useMemo(() => {
    if (isAdmin) return allAreas
    const allowed = new Set(user.areas)
    if (allowed.size === 0) return []
    return allAreas.filter((a) => allowed.has(a.id))
  }, [allAreas, isAdmin, user.areas])

  return { data, loading, error, refetch }
}
