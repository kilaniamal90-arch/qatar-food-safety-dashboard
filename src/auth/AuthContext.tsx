/* eslint-disable react-refresh/only-export-components -- auth context bundle */
import type { Session } from "@supabase/supabase-js"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  AREA_IDS_STORAGE_KEY,
  readStoredAreaIds,
  readStoredRole,
  profileRoleFromUsersTable,
  type SessionRole,
  SESSION_ROLES,
  STORAGE_KEY,
  writeStoredAreaIds,
  writeStoredRole,
} from "@/auth/session"
import { supabase } from "@/lib/supabase"
import i18n from "@/i18n/config"
import toast from "react-hot-toast"

export type SessionUser = {
  id: string
  name: string
  role: SessionRole
  /** Supabase `public.areas.id` values from `user_areas` for supervisor / inspector. */
  areas: string[]
  email?: string | null
}

type AuthValue = {
  user: SessionUser
  isAdmin: boolean
  /** Mock permission — admins and inspector roles may import spreadsheets. */
  canImport: boolean
  isAuthenticated: boolean
  authReady: boolean
  session: Session | null
  setRoleDev: (role: SessionRole) => void
  setAssignedAreaIdsDev: (areaIds: string[]) => void
  signInWithEmailPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>
}

const AuthCtx = createContext<AuthValue | null>(null)

function roleFromUserMetadata(
  meta: Record<string, unknown> | undefined,
): SessionRole | null {
  if (!meta) return null
  const r = meta.app_role ?? meta.role
  if (typeof r !== "string") return null
  const normalized = r === "inspector_manager" ? "supervisor" : r
  if (typeof normalized === "string" && SESSION_ROLES.includes(normalized as SessionRole)) {
    return normalized as SessionRole
  }
  return null
}

function areasFromUserMetadata(meta: Record<string, unknown> | undefined): string[] | null {
  if (!meta) return null
  const raw = meta.area_ids ?? meta.areas
  if (!Array.isArray(raw)) return null
  const out = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
  return out.length > 0 ? out : null
}

function displayNameFromUser(
  meta: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  const n = typeof meta?.name === "string" ? meta.name.trim() : ""
  if (n) return n
  const legacy = typeof meta?.full_name === "string" ? meta.full_name.trim() : ""
  if (legacy) return legacy
  if (email?.includes("@")) return email.split("@")[0] ?? "User"
  return "User"
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [roleOverride, setRoleOverride] = useState<SessionRole>(readStoredRole)
  const [areaIdsOverride, setAreaIdsOverride] = useState<string[]>(readStoredAreaIds)
  const [profileRow, setProfileRow] = useState<{
    role: SessionRole
    areaIds: string[]
    canImport: boolean
    isActive: boolean
    name: string | null
  } | null>(null)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRoleOverride(readStoredRole())
      if (e.key === AREA_IDS_STORAGE_KEY) setAreaIdsOverride(readStoredAreaIds())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) {
        setSession(data.session)
        setAuthReady(true)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!session?.user) {
      setProfileRow(null)
      setProfileReady(true)
      return
    }
    setProfileReady(false)
    void (async () => {
      const sel = `
          role,
          can_import,
          is_active,
          name,
          user_areas ( area_id )
        `
      const first = await supabase
        .from("users")
        .select(sel)
        .eq("auth_user_id", session.user.id)
        .maybeSingle()

      let data = first.data as {
        role?: string
        can_import?: boolean
        is_active?: boolean
        name?: string | null
        user_areas?: { area_id: string }[] | null
      } | null
      let error = first.error

      if (
        error &&
        (error.message.includes("user_areas") ||
          error.message.includes("schema cache") ||
          error.code === "PGRST200")
      ) {
        const retry = await supabase
          .from("users")
          .select("role, can_import, is_active, name")
          .eq("auth_user_id", session.user.id)
          .maybeSingle()
        data = retry.data as typeof data
        error = retry.error
      }

      if (cancelled) return

      if (error || !data) {
        setProfileRow(null)
        setProfileReady(true)
        return
      }

      const row = data
      const r = row.role
      const role = profileRoleFromUsersTable(r)
      const areaIds =
        row.user_areas?.map((x) => String(x.area_id)).filter((x) => x.trim()) ?? []
      const fn = (typeof row.name === "string" && row.name.trim()) || null

      setProfileRow({
        role,
        areaIds,
        canImport: Boolean(row.can_import),
        isActive: row.is_active !== false,
        name: fn,
      })
      setProfileReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user || !profileReady) return
    if (profileRow && profileRow.isActive === false) {
      void (async () => {
        await supabase.auth.signOut()
        toast.error(i18n.t("auth.inactiveAccount"))
      })()
    }
  }, [session?.user?.id, profileRow, profileReady])

  const setRoleDev = useCallback((r: SessionRole) => {
    writeStoredRole(r)
    setRoleOverride(r)
  }, [])

  const setAssignedAreaIdsDev = useCallback((ids: string[]) => {
    writeStoredAreaIds(ids)
    setAreaIdsOverride(ids)
  }, [])

  const signInWithEmailPassword = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      return { error: error ? new Error(error.message) : null }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const redirectTo = `${window.location.origin}/login`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const value = useMemo<AuthValue>(() => {
    const isAuthenticated = Boolean(session?.user)
    if (!isAuthenticated || !session?.user) {
      return {
        user: {
          id: "",
          name: "",
          role: "viewer",
          areas: [],
          email: null,
        },
        isAdmin: false,
        canImport: false,
        isAuthenticated: false,
        authReady,
        session,
        setRoleDev,
        setAssignedAreaIdsDev,
        signInWithEmailPassword,
        signOut,
        resetPasswordForEmail,
      }
    }

    const u = session.user
    const meta = u.user_metadata as Record<string, unknown> | undefined
    const metaRole = roleFromUserMetadata(meta)
    const metaAreas = areasFromUserMetadata(meta)
    const effectiveRole: SessionRole = profileRow
      ? profileRow.role
      : (metaRole ?? roleOverride)
    const effectiveAreas = profileRow
      ? profileRow.areaIds
      : (metaAreas ?? areaIdsOverride)
    const user: SessionUser = {
      id: u.id,
      name:
        (profileRow?.name && profileRow.name.trim()) ||
        displayNameFromUser(meta, u.email),
      role: effectiveRole,
      areas: effectiveAreas,
      email: u.email,
    }

    return {
      user,
      isAdmin: effectiveRole === "admin",
      canImport: profileRow ? profileRow.canImport : effectiveRole !== "viewer",
      isAuthenticated: true,
      authReady,
      session,
      setRoleDev,
      setAssignedAreaIdsDev,
      signInWithEmailPassword,
      signOut,
      resetPasswordForEmail,
    }
  }, [
    session,
    authReady,
    roleOverride,
    areaIdsOverride,
    profileRow,
    signInWithEmailPassword,
    signOut,
    resetPasswordForEmail,
    setRoleDev,
    setAssignedAreaIdsDev,
  ])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx)
  if (!v) throw new Error("useAuth requires AuthProvider")
  return v
}
