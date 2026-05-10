import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"

import { useAuth } from "@/auth/AuthContext"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const MIN_LEN = 8

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const curId = useId()
  const nextId = useId()
  const confId = useId()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  const reset = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setShow(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = user.email?.trim()
    if (!email) {
      toast.error(t("settings.noEmailForPassword"))
      return
    }
    if (newPassword.length < MIN_LEN) {
      toast.error(t("settings.passwordMin"))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("settings.passwordMismatch"))
      return
    }

    setBusy(true)
    const signRes = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signRes.error) {
      setBusy(false)
      toast.error(t("settings.currentPasswordWrong"))
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(t("settings.passwordUpdated"))
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.changePasswordTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.changePasswordDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            id={curId}
            label={t("settings.currentPassword")}
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            show={show}
            onToggleShow={() => setShow((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
          />
          <Field
            id={nextId}
            label={t("settings.newPassword")}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            show={show}
            onToggleShow={() => setShow((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
          />
          <Field
            id={confId}
            label={t("settings.confirmPassword")}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            show={show}
            onToggleShow={() => setShow((s) => !s)}
            showLabel={t("login.showPassword")}
            hideLabel={t("login.hidePassword")}
          />
          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              {t("settings.cancel")}
            </Button>
            <Button type="submit" className="gap-2" disabled={busy}>
              {busy ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  {t("settings.updatingPassword")}
                </>
              ) : (
                t("settings.savePassword")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  show: boolean
  onToggleShow: () => void
  showLabel: string
  hideLabel: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={cn("pe-10")}
          required
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleShow}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={show ? hideLabel : showLabel}
        >
          {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    </div>
  )
}
