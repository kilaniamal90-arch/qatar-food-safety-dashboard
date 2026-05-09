export type SessionRole = "admin" | "supervisor" | "inspector" | "viewer"

export const STORAGE_KEY = "qfsd-dev-role"

/** Dev-only: JSON string array of Supabase `areas.id` for inspector roles. */
export const AREA_IDS_STORAGE_KEY = "qfsd-dev-area-ids"

export function readStoredAreaIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(AREA_IDS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "")
  } catch {
    return []
  }
}

export function writeStoredAreaIds(ids: string[]) {
  try {
    localStorage.setItem(AREA_IDS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* noop */
  }
}

export const SESSION_ROLES: SessionRole[] = [
  "viewer",
  "inspector",
  "supervisor",
  "admin",
]

export function parseRole(raw: string | null): SessionRole {
  if (raw == null || raw === "") return "admin"
  if (raw === "inspector_manager") return "supervisor"
  if (SESSION_ROLES.includes(raw as SessionRole)) return raw as SessionRole
  return "admin"
}

/** `public.users.role` → session role (never "viewer"). */
export function profileRoleFromUsersTable(r: string | undefined | null): SessionRole {
  const s = String(r ?? "").trim()
  if (s === "inspector_manager") return "supervisor"
  if (s === "admin" || s === "supervisor" || s === "inspector") return s
  return "inspector"
}

export function readStoredRole(): SessionRole {
  if (typeof window === "undefined") return "admin"
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "inspector_manager") {
      writeStoredRole("supervisor")
      return "supervisor"
    }
    return parseRole(stored)
  } catch {
    return "admin"
  }
}

export function writeStoredRole(role: SessionRole) {
  try {
    localStorage.setItem(STORAGE_KEY, role)
  } catch {
    /* noop */
  }
}
