import type { AdminUserRole, ManagedUser } from "@/admin/types"
import { normalizeAdminUserRole } from "@/admin/types"
import { supabase } from "@/lib/supabase"
import { getAdminServiceClient } from "@/lib/supabase/adminServiceClient"

/** Normalize booleans from PostgREST / legacy rows (avoids truthy string bugs). */
function coercePgBoolean(value: unknown): boolean {
  if (value === true || value === "true" || value === "t" || value === 1 || value === "1") return true
  if (value === false || value === "false" || value === "f" || value === 0 || value === "0") return false
  return false
}

function rowToManagedUser(
  raw: Record<string, unknown>,
  areaIds: string[],
): ManagedUser | null {
  if (raw.id === undefined || raw.id === null) return null
  const id = String(raw.id)
  const authRaw = raw.auth_user_id
  const authUserId =
    authRaw !== null && authRaw !== undefined && String(authRaw).trim() !== ""
      ? String(authRaw)
      : null
  const email = typeof raw.email === "string" ? raw.email.trim() : ""
  const nameRaw = typeof raw.name === "string" ? raw.name.trim() : ""
  const name =
    nameRaw ||
    (email.includes("@") ? (email.split("@")[0] ?? "") : "") ||
    "User"
  const role = normalizeAdminUserRole(String(raw.role ?? "inspector"))

  return {
    id,
    authUserId,
    name,
    email,
    role,
    areaIds,
    canImport: coercePgBoolean(raw.can_import),
    isActive: raw.is_active !== false,
  }
}

async function syncUserAreas(
  userId: string,
  areaIds: string[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase.from("user_areas").delete().eq("user_id", userId)
  if (delErr) return { error: delErr.message }
  if (areaIds.length === 0) return { error: null }
  const rows = areaIds.map((area_id) => ({ user_id: userId, area_id }))
  const { error: insErr } = await supabase.from("user_areas").insert(rows)
  if (insErr) return { error: insErr.message }
  return { error: null }
}

export async function fetchManagedUsers(): Promise<{
  users: ManagedUser[]
  error: string | null
}> {
  const { data: userRows, error: uErr } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })

  if (uErr) return { users: [], error: uErr.message }

  const { data: uaRows, error: aErr } = await supabase
    .from("user_areas")
    .select("user_id, area_id")

  if (aErr) return { users: [], error: aErr.message }

  const byUser = new Map<string, string[]>()
  for (const r of uaRows ?? []) {
    const uid = String(r.user_id)
    const aid = String(r.area_id).trim()
    if (!aid) continue
    const arr = byUser.get(uid) ?? []
    arr.push(aid)
    byUser.set(uid, arr)
  }

  const users = (userRows ?? [])
    .map((raw) =>
      rowToManagedUser(
        raw as Record<string, unknown>,
        byUser.get(String((raw as { id: unknown }).id)) ?? [],
      ),
    )
    .filter((u): u is ManagedUser => u !== null)

  return { users, error: null }
}

/** Default login password for users created from the Admin panel (must change on first login). */
export const ADMIN_DEFAULT_TEMP_PASSWORD = "123456"

export type CreateAdminUserInput = {
  email: string
  name: string
  role: AdminUserRole
  areaIds: string[]
  canImport: boolean
  isActive: boolean
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<{ error: string | null }> {
  const svc = getAdminServiceClient()
  if (!svc) {
    return {
      error:
        "Missing VITE_SUPABASE_SERVICE_ROLE_KEY — required in the browser to create Supabase Auth users (use a backend in production).",
    }
  }

  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: input.email.trim(),
    password: ADMIN_DEFAULT_TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: { name: input.name.trim(), app_role: input.role },
  })

  if (cErr || !created.user) {
    return { error: cErr?.message ?? "Could not create auth user" }
  }

  const uid = created.user.id

  if (!input.isActive) {
    const { error: banErr } = await svc.auth.admin.updateUserById(uid, {
      ban_duration: "876600h",
    })
    if (banErr) {
      await svc.auth.admin.deleteUser(uid)
      return { error: banErr.message }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("users")
    .insert({
      auth_user_id: uid,
      email: input.email.trim(),
      name: input.name.trim(),
      role: input.role,
      can_import: !!input.canImport,
      is_active: input.isActive,
      must_change_password: true,
    })
    .select("id")
    .single()

  if (insErr || !inserted?.id) {
    await svc.auth.admin.deleteUser(uid)
    return { error: insErr?.message ?? "Could not create profile" }
  }

  const profileId = String(inserted.id)

  const sync = await syncUserAreas(profileId, input.areaIds)
  if (sync.error) {
    await supabase.from("users").delete().eq("id", profileId)
    await svc.auth.admin.deleteUser(uid)
    return { error: sync.error }
  }

  return { error: null }
}

export type UpdateAdminUserInput = {
  profileId: string
  authUserId: string | null
  name: string
  email: string
  password?: string
  role: AdminUserRole
  areaIds: string[]
  canImport: boolean
  isActive: boolean
}

/** Safe for console logs (never includes raw password). */
function sanitizeUpdateAdminUserInputForLog(input: UpdateAdminUserInput) {
  return {
    profileId: input.profileId,
    authUserId: input.authUserId,
    name: input.name,
    email: input.email,
    role: input.role,
    areaIds: input.areaIds,
    canImport: input.canImport,
    isActive: input.isActive,
    passwordProvided: Boolean(input.password?.trim()),
  }
}

export async function updateAdminUser(
  input: UpdateAdminUserInput,
): Promise<{ error: string | null }> {
  console.log("[updateAdminUser] called with:", sanitizeUpdateAdminUserInputForLog(input))

  const { data: sessionData } = await supabase.auth.getSession()
  const myAuthId = sessionData.session?.user.id ?? null

  const profileId = String(input.profileId).trim()
  if (!profileId) {
    console.error("[updateAdminUser] invalid profile id")
    return { error: "Invalid user id" }
  }

  const canImport = Boolean(input.canImport)
  const isActive = Boolean(input.isActive)

  const { data: row, error: loadErr } = await supabase
    .from("users")
    .select("auth_user_id")
    .eq("id", profileId)
    .single()

  if (loadErr || !row) {
    console.error("[updateAdminUser] load profile failed:", { loadErr, profileId })
    return { error: loadErr?.message ?? "User not found" }
  }

  const targetAuth = row.auth_user_id as string | null
  console.log("[updateAdminUser] loaded row:", { profileId, targetAuth })

  if (myAuthId && targetAuth === myAuthId) {
    const danger = !isActive || input.role !== "admin"
    if (danger) {
      console.warn("[updateAdminUser] blocked self-demotion / deactivation")
      return {
        error: "You cannot demote or deactivate your own admin account",
      }
    }
  }

  const profileUpdate = {
    name: input.name.trim(),
    email: input.email.trim() || null,
    role: input.role,
    can_import: canImport,
    is_active: isActive,
  }

  console.log("[updateAdminUser] updating DB with:", { profileId, profileUpdate })

  const { data: updatedRow, error: upErr } = await supabase
    .from("users")
    .update(profileUpdate)
    .eq("id", profileId)
    .select("id, role, can_import, is_active, name, email")
    .maybeSingle()

  console.log("[updateAdminUser] UPDATE result:", { data: updatedRow, error: upErr })

  if (upErr) {
    console.error("[updateAdminUser] UPDATE error:", upErr.message, upErr)
    return { error: upErr.message }
  }

  if (!updatedRow) {
    console.warn(
      "[updateAdminUser] UPDATE finished with error=null but no returned row — possible 0 rows matched id or RETURNING blocked:",
      { profileId },
    )
  }

  if (import.meta.env.DEV && updatedRow && coercePgBoolean(updatedRow.can_import) !== canImport) {
    console.warn("[updateAdminUser] can_import not persisted as expected", {
      wanted: canImport,
      got: updatedRow.can_import,
      profileId,
    })
  }

  const sync = await syncUserAreas(profileId, input.areaIds)
  if (sync.error) {
    console.error("[updateAdminUser] syncUserAreas failed:", sync.error)
    return sync
  }

  if (targetAuth) {
    const svc = getAdminServiceClient()
    if (!svc) {
      const msg =
        "Missing VITE_SUPABASE_SERVICE_ROLE_KEY — required to sync email, password, or login ban state with Supabase Auth."
      console.error("[updateAdminUser]", msg)
      return { error: msg }
    }

    const patch: {
      email?: string
      password?: string
      user_metadata?: Record<string, unknown>
      ban_duration?: string
    } = {
      user_metadata: { name: input.name.trim(), app_role: input.role },
      ban_duration: isActive ? "0" : "876600h",
    }

    if (input.email.trim()) patch.email = input.email.trim()
    if (input.password?.trim()) patch.password = input.password.trim()

    console.log("[updateAdminUser] syncing Auth user:", {
      targetAuth,
      patchKeys: Object.keys(patch),
      passwordInPatch: Boolean(patch.password),
    })

    const { error: uaErr } = await svc.auth.admin.updateUserById(targetAuth, patch)
    if (uaErr) {
      console.error("[updateAdminUser] Auth admin update failed:", uaErr.message, uaErr)
      return { error: uaErr.message }
    }
    console.log("[updateAdminUser] Auth admin update OK")
  }

  console.log("[updateAdminUser] completed successfully")
  return { error: null }
}

export async function deleteAdminUser(
  profileId: string,
): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const myAuthId = sessionData.session?.user.id ?? null

  const { data: row, error: loadErr } = await supabase
    .from("users")
    .select("auth_user_id")
    .eq("id", profileId)
    .maybeSingle()

  if (loadErr) return { error: loadErr.message }

  const authUid =
    row && row.auth_user_id !== null && row.auth_user_id !== undefined
      ? String(row.auth_user_id)
      : null

  if (myAuthId && authUid === myAuthId) {
    return { error: "You cannot delete your own account" }
  }

  if (authUid) {
    const svc = getAdminServiceClient()
    if (!svc) {
      return {
        error:
          "Missing VITE_SUPABASE_SERVICE_ROLE_KEY — required to delete Supabase Auth users.",
      }
    }
    const { error: delErr } = await svc.auth.admin.deleteUser(authUid)
    if (delErr) return { error: delErr.message }
  } else {
    const { error: delErr } = await supabase.from("users").delete().eq("id", profileId)
    if (delErr) return { error: delErr.message }
  }

  return { error: null }
}

export async function resetAdminUserPassword(
  profileId: string,
  authUserId: string,
): Promise<{ error: string | null }> {
  const svc = getAdminServiceClient()
  if (!svc) {
    return {
      error:
        "Missing VITE_SUPABASE_SERVICE_ROLE_KEY — required to reset passwords.",
    }
  }

  const { error: authError } = await svc.auth.admin.updateUserById(authUserId, {
    password: ADMIN_DEFAULT_TEMP_PASSWORD,
  })
  if (authError) return { error: authError.message }

  const { error: dbError } = await supabase
    .from("users")
    .update({ must_change_password: true })
    .eq("id", profileId)

  if (dbError) return { error: dbError.message }

  return { error: null }
}

export async function activateAdminUser(profileId: string): Promise<{ error: string | null }> {
  const svc = getAdminServiceClient()
  if (!svc) {
    return {
      error:
        "Missing VITE_SUPABASE_SERVICE_ROLE_KEY — required to activate accounts with Supabase Auth.",
    }
  }

  const { data: row, error: loadErr } = await supabase
    .from("users")
    .select("id, email, auth_user_id, is_active, name, role")
    .eq("id", profileId)
    .single()

  if (loadErr || !row) return { error: loadErr?.message ?? "User not found" }

  if (row.auth_user_id) {
    return { error: "Account is already linked to Supabase Auth" }
  }

  const em = (row.email ?? "").trim()
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return { error: "Save a valid email on this user before activation" }
  }

  const display =
    (row.name && String(row.name).trim()) || em.split("@")[0] || "User"
  const appRole = normalizeAdminUserRole(String(row.role ?? "inspector"))

  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: em,
    password: ADMIN_DEFAULT_TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: { name: display, app_role: appRole },
  })

  if (cErr || !created.user) {
    return { error: cErr?.message ?? "Could not create auth user" }
  }

  const uid = created.user.id

  const { error: upErr } = await supabase
    .from("users")
    .update({
      auth_user_id: uid,
      password_hash: null,
      must_change_password: true,
    })
    .eq("id", profileId)

  if (upErr) {
    await svc.auth.admin.deleteUser(uid)
    return { error: upErr.message }
  }

  if (row.is_active === false) {
    const { error: banErr } = await svc.auth.admin.updateUserById(uid, {
      ban_duration: "876600h",
    })
    if (banErr) {
      await svc.auth.admin.deleteUser(uid)
      await supabase.from("users").update({ auth_user_id: null }).eq("id", profileId)
      return { error: banErr.message }
    }
  }

  return { error: null }
}
