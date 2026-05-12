import { EyeIcon, EyeOffIcon, GlobeIcon, Loader2Icon, LockIcon, MailIcon, MoonIcon, SunIcon } from "lucide-react"
import { motion } from "framer-motion"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useTheme } from "next-themes"

import { useAuth } from "@/auth/AuthContext"
import { ForceChangePasswordModal } from "@/components/auth/ForceChangePasswordModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setLocale } from "@/i18n/config"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const REMEMBER_EMAIL_KEY = "qfs-login-email"

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const dir = i18n.dir()
  const { setTheme, resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const fromParam = (location.state as { from?: string } | undefined)?.from
  const {
    signInWithEmailPassword,
    isAuthenticated,
    authReady,
    profileReady,
    mustChangePassword,
    usersTableId,
    refreshProfile,
    session,
    user,
  } = useAuth()

  const emailId = useId()
  const passwordId = useId()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [logoSrc, setLogoSrc] = useState("/logo.png")
  const [forcePasswordAfterLogin, setForcePasswordAfterLogin] = useState(false)
  const [pendingUsersTableId, setPendingUsersTableId] = useState<string | null>(null)

  const dest = useMemo(() => {
    return fromParam && fromParam !== "/login" && !fromParam.startsWith("/login")
      ? fromParam
      : "/dashboard"
  }, [fromParam])

  const effectiveDbUserId = pendingUsersTableId ?? usersTableId ?? ""
  const modalEmail = (session?.user?.email ?? user.email ?? email).trim()
  const showForceModal =
    Boolean(isAuthenticated && effectiveDbUserId && modalEmail) &&
    (forcePasswordAfterLogin || (profileReady && mustChangePassword))

  const waitingForProfile =
    authReady && isAuthenticated && !profileReady && !forcePasswordAfterLogin

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRememberMe(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const currentLng = i18n.language.startsWith("ar") ? "ar" : "en"

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (loading) return
      const em = email.trim()
      if (!em) {
        toast.error(t("login.emailRequired"))
        return
      }
      if (!password) {
        toast.error(t("login.passwordRequired"))
        return
      }
      setLoading(true)
      const { error } = await signInWithEmailPassword(em, password)
      if (error) {
        setLoading(false)
        toast.error(error.message)
        return
      }

      const { data: sessWrap } = await supabase.auth.getSession()
      const uid = sessWrap.session?.user?.id
      if (!uid) {
        setLoading(false)
        toast.error(t("auth.passwordChangeError"))
        return
      }

      const { data: userData, error: userFetchError } = await supabase
        .from("users")
        .select("must_change_password, role, id, name")
        .eq("auth_user_id", uid)
        .maybeSingle()

      setLoading(false)

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, em)
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY)
        }
      } catch {
        /* ignore */
      }

      if (userFetchError) {
        toast.error(t("auth.networkError"))
        navigate(dest, { replace: true })
        return
      }

      if (userData?.must_change_password === true && userData.id) {
        setPassword("")
        setPendingUsersTableId(String(userData.id))
        setForcePasswordAfterLogin(true)
        toast.success(t("login.success"))
        return
      }

      toast.success(t("login.success"))
      navigate(dest, { replace: true })
    },
    [
      email,
      password,
      rememberMe,
      loading,
      signInWithEmailPassword,
      navigate,
      dest,
      t,
    ],
  )

  if (!authReady) {
    return (
      <div className="relative flex min-h-svh items-center justify-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#6B0F2A] via-[#4a0b1f] to-[#B8860B]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:20px_20px] opacity-90"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20"
          aria-hidden
        />
        <Loader2Icon className="relative z-10 size-10 animate-spin text-white/90" aria-hidden />
      </div>
    )
  }

  if (waitingForProfile) {
    return (
      <div className="relative flex min-h-svh items-center justify-center overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#6B0F2A] via-[#4a0b1f] to-[#B8860B]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:20px_20px] opacity-90"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20"
          aria-hidden
        />
        <Loader2Icon className="relative z-10 size-10 animate-spin text-white/90" aria-hidden />
      </div>
    )
  }

  if (
    authReady &&
    isAuthenticated &&
    profileReady &&
    !mustChangePassword &&
    !forcePasswordAfterLogin
  ) {
    return <Navigate to={dest} replace />
  }

  return (
    <div
      className="relative min-h-svh w-full overflow-x-hidden"
      dir={dir}
    >
      {/* Background — deep burgundy → dark gold; subtle dot grid for depth */}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-br from-[#6B0F2A] via-[#4a0b1f] to-[#B8860B]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.09)_1px,transparent_0)] [background-size:22px_22px] opacity-[0.85]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/25"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_18%,rgba(184,134,11,0.18),transparent_58%)]"
        aria-hidden
      />

      {/* Top bar: theme + language */}
      <div
        className={cn(
          "absolute top-0 z-20 flex w-full items-center justify-between p-4 sm:p-6",
          dir === "rtl" ? "flex-row-reverse" : "",
        )}
      >
        <div className="w-20" aria-hidden />
        <div className={cn("flex items-center gap-1", dir === "rtl" ? "flex-row-reverse" : "")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-md hover:bg-white/25 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"
                aria-label={t("header.language")}
              >
                <GlobeIcon className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={currentLng}
                onValueChange={(v) => {
                  if (v === "ar" || v === "en") void setLocale(v)
                }}
              >
                <DropdownMenuRadioItem value="ar">العربية</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="relative border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-md hover:bg-white/25 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"
            aria-label={t("header.theme")}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </Button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-4 py-16 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 flex flex-col items-center text-center"
          >
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.02 }}
              src={logoSrc}
              alt=""
              className="h-[10.5rem] w-auto max-w-[300px] object-contain drop-shadow-[0_8px_36px_rgba(0,0,0,0.58)] brightness-[1.05] contrast-[1.08]"
              onError={() => setLogoSrc("/favicon.svg")}
            />
            <h1 className="mt-6 max-w-md text-xl font-bold tracking-wide text-white drop-shadow-md sm:text-2xl">
              {t("login.title")}
            </h1>
            <p className="mt-2 font-medium leading-relaxed text-white/90 drop-shadow text-lg sm:text-xl">
              {t("login.subtitle")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "rounded-2xl border p-6 shadow-2xl sm:p-8",
              "border-white/30 bg-white/20 backdrop-blur-xl",
              "dark:border-white/10 dark:bg-gray-950/35 dark:backdrop-blur-xl",
            )}
          >
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor={emailId} className="text-foreground/90 dark:text-white/95">
                  {t("login.emailLabel")}
                </Label>
                <div className="relative">
                  <MailIcon
                    className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3 dark:text-white/55"
                    aria-hidden
                  />
                  <Input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("login.emailPlaceholder")}
                    className="h-11 border-white/40 bg-white/80 px-10 dark:border-white/15 dark:bg-black/25 dark:text-white dark:placeholder:text-white/45"
                    disabled={loading || showForceModal}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={passwordId} className="text-foreground/90 dark:text-white/95">
                  {t("login.passwordLabel")}
                </Label>
                <div className="relative">
                  <LockIcon
                    className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3 dark:text-white/55"
                    aria-hidden
                  />
                  <Input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    className="h-11 border-white/40 bg-white/80 px-10 pe-12 dark:border-white/15 dark:bg-black/25 dark:text-white dark:placeholder:text-white/45"
                    disabled={loading || showForceModal}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    disabled={loading || showForceModal}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4" aria-hidden />
                    ) : (
                      <EyeIcon className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  "flex flex-wrap items-center gap-3",
                  dir === "rtl" ? "flex-row-reverse" : "",
                )}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/90 dark:text-white/90">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading || showForceModal}
                    className="size-4 rounded border border-white/50 bg-white/50 text-[#8B1538] focus:ring-[#8B1538] dark:border-white/30 dark:bg-black/30"
                  />
                  {t("login.rememberMe")}
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading || showForceModal}
                className="h-11 w-full bg-[#8B1538] text-base font-semibold text-white shadow-lg transition-all hover:bg-[#6B0F2A] dark:bg-[#8B1538] dark:hover:bg-[#a01844]"
              >
                {loading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    {t("login.signingIn")}
                  </>
                ) : (
                  t("login.signIn")
                )}
              </Button>
            </form>
          </motion.div>

          <footer className="mt-8 space-y-1.5 text-center">
            <p className="text-sm font-semibold tracking-wide text-white/95 drop-shadow-md">
              سلامة الغذاء - التفتيش المحلي
            </p>
            <p className="text-xs font-medium text-white/80 drop-shadow">
              إعداد التطبيق: أمل الكيلاني
            </p>
          </footer>
        </motion.div>
      </div>

      <ForceChangePasswordModal
        open={showForceModal}
        userEmail={modalEmail}
        usersTableId={effectiveDbUserId}
        onCompleted={async () => {
          await refreshProfile()
          setForcePasswordAfterLogin(false)
          setPendingUsersTableId(null)
          navigate(dest, { replace: true })
        }}
      />
    </div>
  )
}
