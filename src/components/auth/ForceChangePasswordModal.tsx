import {
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  LockIcon,
  XCircleIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  userEmail: string
  usersTableId: string
  onCompleted: () => void | Promise<void>
}

function passwordRulesMet(password: string) {
  return {
    minLen: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  }
}

export function ForceChangePasswordModal({
  open,
  userEmail,
  usersTableId,
  onCompleted,
}: Props) {
  const { t, i18n } = useTranslation()
  const dir = i18n.dir()
  const curId = useId()
  const newId = useId()
  const confId = useId()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowCurrent(false)
      setShowNew(false)
      setShowConfirm(false)
      setLoading(false)
    }
  }, [open])

  const rules = useMemo(() => passwordRulesMet(newPassword), [newPassword])
  const allRulesOk = rules.minLen && rules.upper && rules.lower && rules.number
  const differsFromCurrent =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    newPassword !== currentPassword
  const confirmOk =
    confirmPassword.length > 0 && confirmPassword === newPassword && newPassword.length > 0
  const canSubmit =
    currentPassword.length > 0 && allRulesOk && differsFromCurrent && confirmOk && !loading

  const mapUpdateUserError = (message: string): string => {
    const m = message.toLowerCase()
    if (
      m.includes("password") &&
      (m.includes("weak") || m.includes("strength") || m.includes("least") || m.includes("short"))
    ) {
      return t("auth.weakPassword")
    }
    return t("auth.passwordChangeError")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const email = userEmail.trim()
    if (!email) {
      toast.error(t("auth.passwordChangeError"))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("auth.passwordsDoNotMatch"))
      return
    }

    if (!allRulesOk || !differsFromCurrent) {
      toast.error(t("auth.weakPassword"))
      return
    }

    setLoading(true)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (verifyError) {
        toast.error(t("auth.invalidCurrentPassword"))
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        toast.error(mapUpdateUserError(updateError.message))
        return
      }

      const { error: dbError } = await supabase
        .from("users")
        .update({ must_change_password: false })
        .eq("id", usersTableId)

      if (dbError) {
        toast.error(t("auth.passwordChangeError"))
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success(t("auth.passwordChangedSuccess"))
      await onCompleted()
    } catch (err) {
      console.error("Password change error:", err)
      toast.error(t("auth.networkError"))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      dir={dir}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="force-change-password-title"
        className={cn(
          "relative w-full max-w-lg rounded-2xl border-2 border-[#D4AF37]/50 bg-card p-6 shadow-2xl sm:p-8",
          "ring-1 ring-[#8B1538]/20",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6 space-y-2 text-center">
          <h2
            id="force-change-password-title"
            className="text-xl font-bold tracking-tight text-[#8B1538] sm:text-2xl"
          >
            {t("auth.forceChangeTitle")}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground sm:text-base">
            {t("auth.forceChangeSubtitle")}
          </p>
          <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("auth.forceChangeMessage")}
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <PasswordField
            id={curId}
            label={t("auth.currentPassword")}
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            shown={showCurrent}
            onToggle={() => setShowCurrent((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
            disabled={loading}
            icon={<LockIcon className="size-4 text-[#8B1538]/80" aria-hidden />}
          />

          <PasswordField
            id={newId}
            label={t("auth.newPassword")}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            shown={showNew}
            onToggle={() => setShowNew((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
            disabled={loading}
          />

          <PasswordField
            id={confId}
            label={t("auth.confirmPassword")}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            shown={showConfirm}
            onToggle={() => setShowConfirm((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
            disabled={loading}
          />

          <div
            className="rounded-xl border border-[#8B1538]/20 bg-muted/40 px-4 py-3 text-sm"
            aria-live="polite"
          >
            <p className="mb-2 font-semibold text-[#8B1538]">{t("auth.passwordRequirements")}</p>
            <ul className="space-y-1.5">
              <RequirementRow ok={rules.minLen} label={t("auth.minLength")} />
              <RequirementRow ok={rules.upper} label={t("auth.uppercase")} />
              <RequirementRow ok={rules.lower} label={t("auth.lowercase")} />
              <RequirementRow ok={rules.number} label={t("auth.number")} />
              <RequirementRow ok={differsFromCurrent} label={t("auth.notSameAsCurrent")} />
              <RequirementRow ok={confirmOk} label={t("auth.confirmMatches")} />
            </ul>
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#8B1538] text-base font-semibold text-white shadow-lg hover:bg-[#6B0F2A]"
          >
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                {t("auth.savingPassword")}
              </>
            ) : (
              t("auth.saveNewPassword")
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}

function RequirementRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-green-700 dark:text-green-400" : "text-destructive")}>
      {ok ? (
        <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
      ) : (
        <XCircleIcon className="size-4 shrink-0 opacity-80" aria-hidden />
      )}
      <span>{label}</span>
    </li>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  shown,
  onToggle,
  showLabel,
  hideLabel,
  disabled,
  icon,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  shown: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
  disabled: boolean
  icon?: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-foreground">
        {label}
      </Label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">{icon}</span>
        ) : null}
        <Input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          className={cn("h-11", icon ? "ps-10 pe-11" : "pe-11")}
          required
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onToggle}
          aria-label={shown ? hideLabel : showLabel}
          disabled={disabled}
        >
          {shown ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  )
}
