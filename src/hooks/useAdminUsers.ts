import { useCallback, useEffect, useState } from "react"

import type { ManagedUser } from "@/admin/types"
import { fetchManagedUsers } from "@/lib/supabase/adminUsersCrud"

export function useAdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { users: rows, error: err } = await fetchManagedUsers()

    if (import.meta.env.DEV) {
      console.log("Users:", rows, err)
    }

    if (err) {
      setError(err)
      setUsers([])
    } else {
      setUsers(rows)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { users, loading, error, refetch: load }
}
