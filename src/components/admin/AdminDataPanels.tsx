import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  InfoIcon,
  KeyRoundIcon,
  Loader2Icon,
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PaletteIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldIcon,
  Trash2Icon,
  UserCheckIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"

import type {
  AdminUserRole,
  Inspector,
  ManagedArea,
  ManagedPeriod,
  ManagedRating,
  ManagedStatus,
  ManagedUser,
} from "@/admin/types"
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDelete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAdminUsers } from "@/hooks/useAdminUsers"
import { useAreas } from "@/hooks/useAreas"
import { useInspectors } from "@/hooks/useInspectors"
import { useRatings } from "@/hooks/useRatings"
import { useStatuses } from "@/hooks/useStatuses"
import { useManagedYears, notifyActiveYearsChanged } from "@/hooks/useYears"
import {
  activateAdminUser,
  ADMIN_DEFAULT_TEMP_PASSWORD,
  createAdminUser,
  deleteAdminUser,
  resetAdminUserPassword,
  updateAdminUser,
} from "@/lib/supabase/adminUsersCrud"
import { supabase } from "@/lib/supabase"
import {
  deleteReinspectionPeriodsForRating,
  upsertReinspectionPeriod,
} from "@/lib/supabase/reinspectionPeriods"
import { cn } from "@/lib/utils"

function roleTKey(r: AdminUserRole) {
  switch (r) {
    case "admin":
      return "admin.users.admin" as const
    case "supervisor":
      return "admin.users.supervisor" as const
    default:
      return "admin.users.inspector" as const
  }
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

const tableWrap =
  "overflow-x-auto rounded-xl border border-border shadow-sm"

const th = "border-b border-border bg-muted/50 px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
const td = "border-b border-border px-3 py-2.5 text-sm align-middle"

function defaultReinspectionDays(order: number): number {
  const defaults = [365, 180, 90, 45, 30, 21]
  const idx = Math.min(Math.max(order - 1, 0), defaults.length - 1)
  return defaults[idx] ?? 60
}

export function AdminUsersPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: areas, loading: areasLoading } = useAreas()
  const {
    users,
    loading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useAdminUsers()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<AdminUserRole>("inspector")
  const [areaIds, setAreaIds] = useState<string[]>([])
  const [canImport, setCanImport] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [activateTarget, setActivateTarget] = useState<ManagedUser | null>(null)
  const [activateBusy, setActivateBusy] = useState(false)
  const [resetPwdTarget, setResetPwdTarget] = useState<ManagedUser | null>(null)
  const [resetPwdBusy, setResetPwdBusy] = useState(false)
  const [userCreatedSuccess, setUserCreatedSuccess] = useState<{
    name: string
    email: string
    tempPassword: string
  } | null>(null)

  function resetForm(user?: ManagedUser | null) {
    setEditing(user ?? null)
    setName(user?.name ?? "")
    setEmail(user?.email ?? "")
    setPassword("")
    setRole(user?.role ?? "inspector")
    setAreaIds(user?.areaIds?.length ? user.areaIds : areas.map((a) => a.id))
    setCanImport(user?.canImport ?? false)
    setIsActive(user?.isActive ?? true)
    setFormError(null)
  }

  function openAdd() {
    resetForm(null)
    setDialogOpen(true)
  }

  function openEdit(u: ManagedUser) {
    resetForm(u)
    setDialogOpen(true)
  }

  async function submit() {
    if (name.trim().length < 2) {
      setFormError(t("admin.validation.nameMinLength"))
      return
    }
    if (!isValidEmail(email.trim())) {
      setFormError(t("admin.validation.email"))
      return
    }
    if (role !== "admin" && areaIds.length === 0) {
      setFormError(t("admin.validation.areas"))
      return
    }
    if (editing && password.trim().length > 0 && password.trim().length < 6) {
      setFormError(t("admin.validation.password"))
      return
    }
    setSaving(true)
    setFormError(null)
    if (editing) {
      const updatePayload = {
        profileId: editing.id,
        authUserId: editing.authUserId,
        name: name.trim(),
        email: email.trim(),
        password: password.trim() || undefined,
        role,
        areaIds,
        canImport: Boolean(canImport),
        isActive: Boolean(isActive),
      }
      console.log("[AdminUsersPanel] submit edit → calling updateAdminUser with:", {
        profileId: updatePayload.profileId,
        authUserId: updatePayload.authUserId,
        name: updatePayload.name,
        email: updatePayload.email,
        role: updatePayload.role,
        areaIds: updatePayload.areaIds,
        canImport: updatePayload.canImport,
        isActive: updatePayload.isActive,
        passwordProvided: Boolean(updatePayload.password),
      })
      const { error } = await updateAdminUser(updatePayload)
      setSaving(false)
      if (error) {
        console.error("[AdminUsersPanel] updateAdminUser failed:", error)
        setFormError(error)
        toast.error(error)
        return
      }
      await refetchUsers()
      setDialogOpen(false)
      toast.success(t("admin.common.success"))
      return
    }

    const { error } = await createAdminUser({
      email: email.trim(),
      name: name.trim(),
      role,
      areaIds,
      canImport: Boolean(canImport),
      isActive: Boolean(isActive),
    })
    setSaving(false)
    if (error) {
      console.error("[AdminUsersPanel] createAdminUser failed:", error)
      setFormError(error)
      return
    }
    await refetchUsers()
    setDialogOpen(false)
    setUserCreatedSuccess({
      name: name.trim(),
      email: email.trim(),
      tempPassword: ADMIN_DEFAULT_TEMP_PASSWORD,
    })
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    setBusyDelete(true)
    const { error } = await deleteAdminUser(pendingDeleteId)
    setBusyDelete(false)
    setDeleteOpen(false)
    setPendingDeleteId(null)
    if (error) {
      console.error("[AdminUsersPanel] deleteAdminUser failed:", error)
      toast.error(error)
      return
    }
    await refetchUsers()
    toast.success(t("admin.common.success"))
  }

  async function submitActivate() {
    if (!activateTarget) return
    setActivateBusy(true)
    const { error } = await activateAdminUser(activateTarget.id)
    const savedTarget = activateTarget
    setActivateBusy(false)
    if (error) {
      console.error("[AdminUsersPanel] activateAdminUser failed:", error)
      toast.error(error)
      return
    }
    setActivateOpen(false)
    setActivateTarget(null)
    await refetchUsers()
    setUserCreatedSuccess({
      name: savedTarget.name.trim(),
      email: savedTarget.email.trim(),
      tempPassword: ADMIN_DEFAULT_TEMP_PASSWORD,
    })
  }

  async function confirmResetPassword() {
    if (!resetPwdTarget?.authUserId) return
    setResetPwdBusy(true)
    const { error } = await resetAdminUserPassword(resetPwdTarget.id, resetPwdTarget.authUserId)
    setResetPwdBusy(false)
    if (error) {
      console.error("[AdminUsersPanel] resetAdminUserPassword failed:", error)
      toast.error(error || t("admin.users.resetPasswordError"), { duration: 6000 })
      return
    }
    setResetPwdTarget(null)
    await refetchUsers()
    toast.success(t("admin.users.resetPasswordSuccess"))
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            {t("admin.tabs.users")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.tabs.usersHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={usersLoading}
            onClick={() => void refetchUsers()}
          >
            <RefreshCwIcon className={cn("size-4", usersLoading && "animate-spin")} />
            {t("admin.common.refresh")}
          </Button>
          <Button onClick={() => openAdd()} variant="gold" className="gap-2" disabled={areasLoading}>
            <PlusIcon className="size-4" />
            {t("admin.users.addUser")}
          </Button>
        </div>
      </div>

      {usersError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {usersError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[760px] text-start">
          <thead>
            <tr>
              <th className={th}>{t("admin.users.name")}</th>
              <th className={th}>{t("admin.users.email")}</th>
              <th className={th}>{t("admin.users.role")}</th>
              <th className={th}>{t("admin.users.canImport")}</th>
              <th className={th}>{t("admin.users.status")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading && users.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td className={td} colSpan={6}>
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))
            ) : (
              users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <UserCheckIcon className="size-4 text-muted-foreground shrink-0" aria-hidden />
                    <span className="font-medium text-foreground">{u.name}</span>
                  </div>
                </td>
                <td className={td}>{u.email}</td>
                <td className={td}>
                  <Badge variant="secondary">{t(roleTKey(u.role))}</Badge>
                </td>
                <td className={td}>
                  <Badge variant={u.canImport ? "default" : "secondary"}>
                    {u.canImport ? t("admin.users.yes") : t("admin.users.no")}
                  </Badge>
                </td>
                <td className={td}>
                  <Badge variant={u.isActive ? "success" : "secondary"}>
                    {u.isActive ? t("admin.users.active") : t("admin.users.inactive")}
                  </Badge>
                </td>
                <td className={cn(td, "text-end")}>
                  <div className={cn("flex flex-wrap items-center justify-end gap-2", rtl ? "justify-start" : "justify-end")}>
                    <Switch
                      dir={rtl ? "rtl" : "ltr"}
                      checked={u.isActive}
                      disabled={usersLoading}
                      onCheckedChange={async (c) => {
                        const { error } = await updateAdminUser({
                          profileId: u.id,
                          authUserId: u.authUserId,
                          name: u.name,
                          email: u.email,
                          role: u.role,
                          areaIds: u.areaIds,
                          canImport: Boolean(u.canImport),
                          isActive: Boolean(c),
                        })
                        if (error) {
                          console.error("[AdminUsersPanel] updateAdminUser (toggle) failed:", error)
                          toast.error(error)
                          return
                        }
                        await refetchUsers()
                        toast.success(t("admin.common.success"))
                      }}
                      aria-label={t("admin.users.toggleStatus")}
                    />
                    {u.authUserId ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t("admin.users.resetPassword")}
                            disabled={usersLoading}
                            onClick={() => setResetPwdTarget(u)}
                          >
                            <RotateCcwIcon className="size-4" aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t("admin.users.resetPassword")}</TooltipContent>
                      </Tooltip>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={t("admin.common.actions")}>
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={rtl ? "start" : "end"}>
                        <DropdownMenuItem onClick={() => openEdit(u)}>
                          <PencilIcon className="size-4 opacity-70" /> {t("admin.common.edit")}
                        </DropdownMenuItem>
                        {!u.authUserId ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setActivateTarget(u)
                              setActivateOpen(true)
                            }}
                          >
                            <UserCheckIcon className="size-4 opacity-70" /> {t("admin.users.activateAccount")}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => {
                            setPendingDeleteId(u.id)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2Icon className="size-4 opacity-70" /> {t("admin.common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.users.editUser") : t("admin.users.addUser")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
            {!editing ? (
              <div
                className={cn(
                  "flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
                  rtl && "flex-row-reverse text-end",
                )}
                role="status"
              >
                <InfoIcon className="size-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{t("admin.users.temporaryPasswordNote")}</p>
                  <p className="text-blue-900/85 dark:text-blue-200/90">
                    {t("admin.users.temporaryPasswordNoteDetail")}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label
                htmlFor="adm-u-name"
                className={cn(rtl && "block text-end")}
              >
                {t("admin.users.name")}
              </Label>
              <Input
                id="adm-u-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="adm-u-email"
                className={cn(rtl && "block text-end")}
              >
                {t("admin.users.email")}
              </Label>
              <Input
                id="adm-u-email"
                type="email"
                dir="ltr"
                className="text-start"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {editing ? (
              <div className="space-y-2">
                <Label
                  htmlFor="adm-u-pass"
                  className={cn(rtl && "block text-end")}
                >
                  {t("admin.users.password")}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({t("admin.users.passwordOptional")})
                  </span>
                </Label>
                <Input
                  id="adm-u-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label
                htmlFor="adm-u-role"
                className={cn(rtl && "block text-end")}
              >
                {t("admin.users.role")}
              </Label>
              <select
                id="adm-u-role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as AdminUserRole)
                }
                dir={rtl ? "rtl" : "ltr"}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                  rtl ? "text-end" : "text-start",
                )}
              >
                <option value="admin">{t("admin.users.admin")}</option>
                <option value="supervisor">{t("admin.users.supervisor")}</option>
                <option value="inspector">{t("admin.users.inspector")}</option>
              </select>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <p className={cn("text-sm font-medium", rtl && "text-end")}>
                {t("admin.users.areas")}
              </p>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                {areas.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
                      rtl && "flex-row-reverse",
                      areaIds.includes(a.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={areaIds.includes(a.id)}
                      onChange={(e) => {
                        const on = e.target.checked
                        setAreaIds((prev) =>
                          on
                            ? [...prev, a.id]
                            : prev.filter((x) => x !== a.id),
                        )
                      }}
                    />
                    <span>{i18n.language === "ar" ? a.nameAr : a.nameEn}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div className={cn("min-w-0 flex-1 space-y-1", rtl ? "text-end" : "text-start")}>
                <p className="text-sm font-medium">{t("admin.users.canImport")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.users.canImportHint")}
                </p>
              </div>
              <div className="shrink-0">
                <Switch
                  dir={rtl ? "rtl" : "ltr"}
                  checked={canImport}
                  onCheckedChange={setCanImport}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <Label
                htmlFor="adm-u-is-active"
                className={cn("flex-1 leading-snug", rtl ? "text-end" : "text-start")}
              >
                {t("admin.users.active")}
              </Label>
              <div className="shrink-0">
                <Switch
                  id="adm-u-is-active"
                  dir={rtl ? "rtl" : "ltr"}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>

            {formError && (
              <p
                className={cn(
                  "text-sm font-medium text-red-600",
                  rtl && "text-end",
                )}
                role="alert"
              >
                {formError}
              </p>
            )}
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={userCreatedSuccess !== null}
        onOpenChange={(open) => {
          if (!open) setUserCreatedSuccess(null)
        }}
      >
        <DialogContent dir={rtl ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className={cn("flex items-center gap-2 text-start", rtl && "flex-row-reverse text-end")}
            >
              <CheckCircle2Icon className="size-5 shrink-0 text-green-600 dark:text-green-500" aria-hidden />
              <span>{t("admin.users.userCreatedSuccess")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2 rounded-lg bg-muted/60 p-4">
              <div
                className={cn(
                  "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm",
                  rtl && "flex-row-reverse justify-end text-end",
                )}
              >
                <span className="text-muted-foreground">{t("admin.users.name")}:</span>
                <span className="font-medium text-foreground">{userCreatedSuccess?.name}</span>
              </div>
              <div
                className={cn(
                  "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm",
                  rtl && "flex-row-reverse justify-end text-end",
                )}
              >
                <span className="text-muted-foreground">{t("admin.users.email")}:</span>
                <span className="font-medium break-all text-foreground" dir="ltr">
                  {userCreatedSuccess?.email}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/25">
              <div
                className={cn(
                  "mb-2 flex items-center gap-2 font-medium text-amber-950 dark:text-amber-100",
                  rtl && "flex-row-reverse text-end",
                )}
              >
                <KeyRoundIcon className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                <span>{t("admin.users.temporaryPassword")}</span>
              </div>
              <div
                className="py-2 text-center font-mono text-2xl font-bold tracking-wider text-amber-950 dark:text-amber-100"
                dir="ltr"
              >
                {userCreatedSuccess?.tempPassword}
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <div className={cn("flex gap-2 text-sm text-blue-950 dark:text-blue-100", rtl && "flex-row-reverse")}>
                <AlertCircleIcon
                  className="size-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5"
                  aria-hidden
                />
                <div className={cn("min-w-0 space-y-1", rtl && "text-end")}>
                  <p className="font-medium">{t("admin.users.pleaseInformUser")}</p>
                  <p className="text-blue-900/90 dark:text-blue-200/95">{t("admin.users.userWillChangePassword")}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" className="w-full" onClick={() => setUserCreatedSuccess(null)}>
              {t("admin.common.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.users.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          await confirmDelete()
        }}
      />

      <Dialog
        open={activateOpen}
        onOpenChange={(o) => {
          if (!activateBusy) {
            setActivateOpen(o)
            if (!o) {
              setActivateTarget(null)
            }
          }
        }}
      >
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {t("admin.users.activateAccount")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("admin.users.activateDescription", {
              email: activateTarget?.email ?? "",
            })}
          </p>
          <div
            className={cn(
              "flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
              rtl && "flex-row-reverse text-end",
            )}
            role="status"
          >
            <InfoIcon className="size-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{t("admin.users.temporaryPasswordNote")}</p>
              <p className="text-blue-900/85 dark:text-blue-200/90">
                {t("admin.users.temporaryPasswordNoteDetail")}
              </p>
            </div>
          </div>
          <DialogFooter className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}>
            <Button
              variant="outline"
              type="button"
              disabled={activateBusy}
              onClick={() => {
                setActivateOpen(false)
                setActivateTarget(null)
              }}
            >
              {t("admin.common.cancel")}
            </Button>
            <Button type="button" disabled={activateBusy} onClick={() => void submitActivate()}>
              {activateBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.users.activateSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetPwdTarget !== null}
        onOpenChange={(open) => {
          if (!open && !resetPwdBusy) setResetPwdTarget(null)
        }}
      >
        <DialogContent dir={rtl ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className={cn("flex items-center gap-2 text-start", rtl && "flex-row-reverse text-end")}
            >
              <AlertTriangleIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
              <span>{t("admin.users.resetPasswordTitle")}</span>
            </DialogTitle>
          </DialogHeader>
          <div className={cn("space-y-4 text-sm", rtl && "text-end")}>
            <p className="text-foreground">
              {t("admin.users.resetPasswordPrompt", { name: resetPwdTarget?.name ?? "" })}
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
              {t("admin.users.resetPasswordTempNotice", {
                tempPassword: ADMIN_DEFAULT_TEMP_PASSWORD,
              })}
            </div>
            <div
              className={cn(
                "flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
                rtl && "flex-row-reverse text-end",
              )}
            >
              <AlertCircleIcon className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" aria-hidden />
              <p>{t("admin.users.resetPasswordNextLogin")}</p>
            </div>
          </div>
          <DialogFooter className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}>
            <Button
              type="button"
              variant="outline"
              disabled={resetPwdBusy}
              onClick={() => setResetPwdTarget(null)}
            >
              {t("admin.common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={resetPwdBusy}
              className="gap-2"
              onClick={() => void confirmResetPassword()}
            >
              {resetPwdBusy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
              {t("admin.users.resetPasswordConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </TooltipProvider>
  )
}

export function AdminAreasPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: areas, loading, error: queryError, refetch } = useAreas()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedArea | null>(null)
  const [nameAr, setNameAr] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  function openEdit(a?: ManagedArea) {
    setEditing(a ?? null)
    setNameAr(a?.nameAr ?? "")
    setNameEn(a?.nameEn ?? "")
    setDialogOpen(true)
  }

  async function save() {
    if (!nameAr.trim() || !nameEn.trim()) {
      toast.error(t("admin.common.error"))
      return
    }
    setSaving(true)
    const payload = { name_ar: nameAr.trim(), name_en: nameEn.trim() }
    const res = editing
      ? await supabase.from("areas").update(payload).eq("id", editing.id)
      : await supabase.from("areas").insert(payload)
    setSaving(false)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    await refetch()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <MapPinIcon className="size-6 text-primary mt-1" />
          <div>
            <h2 className="text-lg font-bold">{t("admin.tabs.areas")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.tabs.areasHint")}</p>
          </div>
        </div>
        <Button variant="gold" className="gap-2 shrink-0" onClick={() => openEdit(undefined)}>
          <PlusIcon className="size-4" />
          {t("admin.areas.addArea")}
        </Button>
      </div>
      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}
      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[560px] text-start">
          <thead>
            <tr>
              <th className={th}>{t("admin.areas.nameAr")}</th>
              <th className={th}>{t("admin.areas.nameEn")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={3}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40">
                  <td className={td}>{a.nameAr}</td>
                  <td className={td}>{a.nameEn}</td>
                  <td className={cn(td, "text-end")}>
                    <div className={cn("flex gap-2", rtl ? "justify-start" : "justify-end")}>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(a)}>
                        <PencilIcon className="size-3.5" /> {t("admin.common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setDelId(a.id)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.common.edit") : t("admin.areas.addArea")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameAr")}
              </Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameEn")}
              </Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                dir="ltr"
                className="text-start"
              />
            </div>
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.areas.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          if (!delId) return
          setBusyDelete(true)
          const { error } = await supabase.from("areas").delete().eq("id", delId)
          setBusyDelete(false)
          setDelId(null)
          setDeleteOpen(false)
          if (error) {
            toast.error(error.message)
            return
          }
          await refetch()
          toast.success(t("admin.common.success"))
        }}
      />
    </Card>
  )
}

export function AdminRatingsPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: ratings, loading, error: queryError, refetch } = useRatings()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedRating | null>(null)
  const [nameAr, setNameAr] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [color, setColor] = useState("#888888")
  const [order, setOrder] = useState("1")
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  function open(r?: ManagedRating) {
    setEditing(r ?? null)
    setNameAr(r?.nameAr ?? "")
    setNameEn(r?.nameEn ?? "")
    setColor(r?.color ?? "#888888")
    setOrder(String(r?.order ?? ratings.length + 1))
    setDialogOpen(true)
  }

  async function save() {
    const ord = Number.parseInt(order, 10)
    if (!Number.isFinite(ord)) {
      toast.error(t("admin.common.error"))
      return
    }
    setSaving(true)
    const payload = {
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      color,
      sort_order: ord,
    }
    const res = editing
      ? await supabase.from("ratings").update(payload).eq("id", editing.id)
      : await supabase.from("ratings").insert(payload).select("id").maybeSingle()

    let periodErrMsg: string | null = null
    if (
      !editing &&
      !res.error &&
      res.data &&
      typeof (res.data as { id?: unknown }).id === "string"
    ) {
      const rid = String((res.data as { id: string }).id)
      const { error } = await upsertReinspectionPeriod(
        supabase,
        rid,
        defaultReinspectionDays(ord),
      )
      periodErrMsg = error ? error.message : null
    }

    setSaving(false)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    if (periodErrMsg) {
      toast.error(periodErrMsg)
      return
    }
    await refetch()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <PaletteIcon className="size-6 text-primary mt-1" />
          <div>
            <h2 className="text-lg font-bold">{t("admin.tabs.ratings")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.tabs.ratingsHint")}</p>
          </div>
        </div>
        <Button variant="gold" className="gap-2 shrink-0" onClick={() => open(undefined)}>
          <PlusIcon className="size-4" />
          {t("admin.ratings.addRating")}
        </Button>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[640px] text-start">
          <thead>
            <tr>
              <th className={th}>{i18n.language === "ar" ? t("admin.areas.nameAr") : t("admin.areas.nameEn")}</th>
              <th className={th}>{t("admin.ratings.color")}</th>
              <th className={th}>{t("admin.ratings.order")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={4}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              ratings
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className={cn(td, "font-medium")}>
                      {i18n.language === "ar" ? r.nameAr : r.nameEn}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-6 rounded-full border border-border shadow-sm"
                          style={{ backgroundColor: r.color }}
                          aria-hidden
                        />
                        <code className="text-xs" dir="ltr">
                          {r.color}
                        </code>
                      </div>
                    </td>
                    <td className={td}>{r.order}</td>
                    <td className={cn(td, "text-end")}>
                      <div className={cn("flex gap-2", rtl ? "justify-start" : "justify-end")}>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(r)}>
                          <PencilIcon className="size-3.5" /> {t("admin.common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600"
                          onClick={() => {
                            setDelId(r.id)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.common.edit") : t("admin.ratings.addRating")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameAr")}
              </Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameEn")}
              </Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.ratings.color")}
              </Label>
              <div className={cn("flex items-center gap-3", rtl && "flex-row-reverse")}>
                <Input
                  type="color"
                  className="h-10 w-16 cursor-pointer p-1"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.ratings.order")}
              </Label>
              <Input type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.ratings.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          if (!delId) return
          setBusyDelete(true)
          const { error: pe } = await deleteReinspectionPeriodsForRating(
            supabase,
            delId,
          )
          if (pe) {
            setBusyDelete(false)
            toast.error(pe.message)
            return
          }
          const { error } = await supabase.from("ratings").delete().eq("id", delId)
          setBusyDelete(false)
          setDelId(null)
          setDeleteOpen(false)
          if (error) {
            toast.error(error.message)
            return
          }
          await refetch()
          toast.success(t("admin.common.success"))
        }}
      />
    </Card>
  )
}

export function AdminYearsPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: managedYears, loading, error: queryError, refetch } = useManagedYears()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear() + 1))
  const [newYearActive, setNewYearActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  const sorted = useMemo(
    () => [...managedYears].sort((a, b) => b.year - a.year),
    [managedYears],
  )

  function openAdd() {
    const nextSuggested = managedYears.reduce(
      (m, x) => Math.max(m, x.year),
      new Date().getFullYear(),
    )
    setYearInput(String(nextSuggested + 1))
    setNewYearActive(false)
    setDialogOpen(true)
  }

  async function addYearSubmit() {
    const y = Number.parseInt(yearInput, 10)
    if (!Number.isFinite(y) || y < 1900 || y > 2100) {
      toast.error(t("admin.validation.invalidYear"))
      return
    }
    if (managedYears.some((x) => x.year === y)) {
      toast.error(t("admin.validation.duplicateYear"))
      return
    }
    setSaving(true)
    const { error } = await supabase.from("years").insert({ year: y, is_active: newYearActive })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await refetch()
    notifyActiveYearsChanged()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <CalendarIcon className="mt-1 size-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold">{t("admin.tabs.years")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.tabs.yearsHint")}</p>
          </div>
        </div>
        <Button variant="gold" className="shrink-0 gap-2" onClick={() => openAdd()}>
          <PlusIcon className="size-4" />
          {t("admin.years.addYear")}
        </Button>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className={th}>{t("admin.years.year")}</th>
              <th className={th}>{t("admin.years.includeInDashboards")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={3}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className={cn(td, "font-medium tabular-nums")}>{row.year}</td>
                  <td className={td}>
                    <div
                      className={cn(
                        "flex",
                        rtl ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className="shrink-0">
                        <Switch
                          dir={rtl ? "rtl" : "ltr"}
                          checked={row.isActive}
                          onCheckedChange={(c) =>
                            void (async () => {
                              const { error } = await supabase
                                .from("years")
                                .update({ is_active: c })
                                .eq("id", row.id)
                              if (error) {
                                toast.error(error.message)
                                return
                              }
                              await refetch()
                              notifyActiveYearsChanged()
                              toast.success(t("admin.common.success"))
                            })()
                          }
                          aria-label={t("admin.years.toggleActive")}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={cn(td, "text-end")}>
                    <div className={cn("flex gap-2", rtl ? "justify-start" : "justify-end")}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600"
                        onClick={() => {
                          setDelId(row.id)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {t("admin.years.addYear")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
            <div className="space-y-2">
              <Label htmlFor="adm-year-value" className={cn(rtl && "block text-end")}>
                {t("admin.years.year")}
              </Label>
              <Input
                id="adm-year-value"
                type="number"
                min={1900}
                max={2100}
                dir="ltr"
                className="text-start tabular-nums"
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <Label
                htmlFor="adm-year-active"
                className={cn("flex-1 leading-snug", rtl ? "text-end" : "text-start")}
              >
                {t("admin.years.includeInDashboards")}
              </Label>
              <div className="shrink-0">
                <Switch
                  id="adm-year-active"
                  dir={rtl ? "rtl" : "ltr"}
                  checked={newYearActive}
                  onCheckedChange={setNewYearActive}
                />
              </div>
            </div>
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void addYearSubmit()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.years.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          if (!delId) return
          setBusyDelete(true)
          const { error } = await supabase.from("years").delete().eq("id", delId)
          setBusyDelete(false)
          setDelId(null)
          setDeleteOpen(false)
          if (error) {
            toast.error(error.message)
            return
          }
          await refetch()
          notifyActiveYearsChanged()
          toast.success(t("admin.common.success"))
        }}
      />
    </Card>
  )
}

export function AdminStatusesPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: statuses, loading, error: queryError, refetch } = useStatuses()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedStatus | null>(null)
  const [nameAr, setNameAr] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [order, setOrder] = useState("1")
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  function open(s?: ManagedStatus) {
    setEditing(s ?? null)
    setNameAr(s?.nameAr ?? "")
    setNameEn(s?.nameEn ?? "")
    setOrder(String(s?.order ?? statuses.length + 1))
    setDialogOpen(true)
  }

  async function save() {
    const ord = Number.parseInt(order, 10)
    if (!Number.isFinite(ord)) {
      toast.error(t("admin.common.error"))
      return
    }
    setSaving(true)
    const payload = {
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      sort_order: ord,
    }
    const res = editing
      ? await supabase.from("operational_statuses").update(payload).eq("id", editing.id)
      : await supabase.from("operational_statuses").insert(payload)
    setSaving(false)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    await refetch()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <ShieldIcon className="size-6 text-primary mt-1" />
          <div>
            <h2 className="text-lg font-bold">{t("admin.tabs.statuses")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.tabs.statusesHint")}</p>
          </div>
        </div>
        <Button variant="gold" className="gap-2 shrink-0" onClick={() => open(undefined)}>
          <PlusIcon className="size-4" />
          {t("admin.statuses.addStatus")}
        </Button>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[560px]">
          <thead>
            <tr>
              <th className={th}>{t("admin.areas.nameAr")}</th>
              <th className={th}>{t("admin.areas.nameEn")}</th>
              <th className={th}>{t("admin.ratings.order")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={4}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              statuses
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <tr key={s.id}>
                    <td className={td}>{s.nameAr}</td>
                    <td className={td}>{s.nameEn}</td>
                    <td className={td}>{s.order}</td>
                    <td className={cn(td, "text-end")}>
                      <div className={cn("flex gap-2", rtl ? "justify-start" : "justify-end")}>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(s)}>
                          <PencilIcon className="size-3.5" /> {t("admin.common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600"
                          onClick={() => {
                            setDelId(s.id)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.common.edit") : t("admin.statuses.addStatus")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameAr")}
              </Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameEn")}
              </Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.ratings.order")}
              </Label>
              <Input type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.statuses.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          if (!delId) return
          setBusyDelete(true)
          const { error } = await supabase.from("operational_statuses").delete().eq("id", delId)
          setBusyDelete(false)
          setDelId(null)
          setDeleteOpen(false)
          if (error) {
            toast.error(error.message)
            return
          }
          await refetch()
          toast.success(t("admin.common.success"))
        }}
      />
    </Card>
  )
}

export function AdminPeriodsPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: ratings, loading, error: queryError, refetch } = useRatings()
  const [local, setLocal] = useState<Record<string, string>>({})
  const [savingRow, setSavingRow] = useState<string | null>(null)

  const periods: ManagedPeriod[] = useMemo(
    () =>
      ratings.map((r) => ({
        id: `pd-${r.id}`,
        ratingId: r.id,
        days:
          typeof r.reinspectionDays === "number"
            ? r.reinspectionDays
            : defaultReinspectionDays(r.order),
      })),
    [ratings],
  )

  const labelFor = (rid: string) => {
    const r = ratings.find((x) => x.id === rid)
    if (!r) return rid
    return i18n.language === "ar" ? r.nameAr : r.nameEn
  }

  async function saveOne(p: ManagedPeriod) {
    const raw = local[p.id] ?? String(p.days)
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t("admin.validation.days"))
      return
    }
    setSavingRow(p.id)
    const { error } = await upsertReinspectionPeriod(supabase, p.ratingId, n)
    setSavingRow(null)
    if (error) {
      toast.error(error.message)
      return
    }
    setLocal((prev) => {
      const next = { ...prev }
      delete next[p.id]
      return next
    })
    await refetch()
    toast.success(t("admin.common.success"))
  }

  const sortedPeriods = periods
    .slice()
    .sort(
      (a, b) =>
        (ratings.find((r) => r.id === a.ratingId)?.order ?? 99) -
        (ratings.find((r) => r.id === b.ratingId)?.order ?? 99),
    )

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex items-start gap-2">
        <RefreshCwIcon className="size-6 text-primary mt-1 shrink-0" />
        <div>
          <h2 className="text-lg font-bold">{t("admin.tabs.periods")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.tabs.periodsHint")}</p>
        </div>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className={th}>{t("admin.periods.rating")}</th>
              <th className={th}>{t("admin.periods.days")}</th>
              <th className={cn(th, "text-end")}>{t("admin.periods.save")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={3}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              sortedPeriods.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className={cn(td, "font-medium")}>{labelFor(p.ratingId)}</td>
                  <td className={td}>
                    <Input
                      type="number"
                      min={1}
                      dir="ltr"
                      className="max-w-[120px] tabular-nums"
                      value={local[p.id] ?? String(p.days)}
                      onChange={(e) =>
                        setLocal((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className={cn(td, "text-end")}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-primary text-primary hover:bg-primary/10"
                      disabled={savingRow === p.id}
                      onClick={() => void saveOne(p)}
                    >
                      {savingRow === p.id ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="size-3.5" />
                      )}
                      {t("admin.periods.save")}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function AdminInspectorsPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const { data: inspectors, loading, error: queryError, refetch } = useInspectors()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Inspector | null>(null)
  const [nameAr, setNameAr] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  function rowLabel(insp: Inspector) {
    return i18n.language === "ar" ? insp.nameAr : insp.nameEn
  }

  function open(inp?: Inspector) {
    setEditing(inp ?? null)
    setNameAr(inp?.nameAr ?? "")
    setNameEn(inp?.nameEn ?? "")
    setActive(inp?.isActive ?? true)
    setFormError(null)
    setDialogOpen(true)
  }

  async function submit() {
    const nameArT = nameAr.trim()
    const nameEnT = nameEn.trim()
    if (!nameArT && !nameEnT) {
      setFormError(t("admin.validation.requiredName"))
      return
    }
    setFormError(null)
    setSaving(true)
    const payload = {
      name: nameEnT || nameArT,
      name_ar: nameArT,
      name_en: nameEnT,
      is_active: active,
    }
    const res = editing
      ? await supabase.from("inspectors").update(payload).eq("id", editing.id)
      : await supabase.from("inspectors").insert(payload)
    setSaving(false)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    await refetch()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  async function doDelete() {
    if (!pendingId) return
    setBusyDelete(true)
    const { error } = await supabase.from("inspectors").delete().eq("id", pendingId)
    setBusyDelete(false)
    setPendingId(null)
    setDeleteOpen(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await refetch()
    toast.success(t("admin.common.success"))
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">{t("admin.tabs.inspectors")}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.tabs.inspectorsHint")}</p>
        </div>
        <Button variant="gold" className="gap-2 shrink-0" onClick={() => open(undefined)}>
          <PlusIcon className="size-4" />
          {t("admin.inspectors.addInspector")}
        </Button>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[480px]">
          <thead>
            <tr>
              <th className={cn(th, "w-12 text-center")}>#</th>
              <th className={th}>{t("admin.inspectors.name")}</th>
              <th className={th}>{t("admin.users.status")}</th>
              <th className={cn(th, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={td} colSpan={4}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : (
              inspectors.map((insp, idx) => (
                <tr key={insp.id} className="hover:bg-muted/40">
                  <td className={cn(td, "text-center tabular-nums text-muted-foreground")}>
                    {idx + 1}
                  </td>
                  <td className={cn(td, "font-medium")}>{rowLabel(insp)}</td>
                  <td className={td}>
                    <Badge variant={insp.isActive ? "success" : "secondary"}>
                      {insp.isActive ? t("admin.users.active") : t("admin.users.inactive")}
                    </Badge>
                  </td>
                  <td className={cn(td, "text-end")}>
                    <div className={cn("flex flex-wrap items-center gap-2", rtl ? "justify-start" : "justify-end")}>
                      <div className="shrink-0">
                        <Switch
                          dir={rtl ? "rtl" : "ltr"}
                          checked={insp.isActive}
                          onCheckedChange={(c) =>
                            void (async () => {
                              const { error } = await supabase
                                .from("inspectors")
                                .update({ is_active: c })
                                .eq("id", insp.id)
                              if (error) {
                                toast.error(error.message)
                                return
                              }
                              await refetch()
                              toast.success(t("admin.common.success"))
                            })()
                          }
                          aria-label={t("admin.inspectors.toggle")}
                        />
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open(insp)}>
                        <PencilIcon className="size-3.5" /> {t("admin.common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600"
                        onClick={() => {
                          setPendingId(insp.id)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2Icon className="size-3.5" /> {t("admin.common.delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.inspectors.editInspector") : t("admin.inspectors.addInspector")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5" dir={rtl ? "rtl" : "ltr"}>
            <div className="space-y-2">
              <Label htmlFor="insp-name-ar" className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameAr")}
              </Label>
              <Input
                id="insp-name-ar"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insp-name-en" className={cn(rtl && "block text-end")}>
                {t("admin.areas.nameEn")}
              </Label>
              <Input
                id="insp-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <Label
                htmlFor="insp-act"
                className={cn("flex-1 leading-snug", rtl ? "text-end" : "text-start")}
              >
                {t("admin.inspectors.isActiveLabel")}
              </Label>
              <div className="shrink-0">
                <Switch
                  id="insp-act"
                  dir={rtl ? "rtl" : "ltr"}
                  checked={active}
                  onCheckedChange={setActive}
                />
              </div>
            </div>
            {formError ? (
              <p className={cn("text-sm font-medium text-red-600", rtl && "text-end")}>
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter
            className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}
          >
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.inspectors.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={() => void doDelete()}
      />
    </Card>
  )
}

