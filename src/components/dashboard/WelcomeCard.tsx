import { motion, useReducedMotion } from "framer-motion"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const TEXT_SHADOW = "0 1px 3px rgba(0,0,0,0.35)"

/** Eastern Arabic + Persian digits → Western (fallback if locale omits `-u-nu-latn`). */
const NON_LATIN_DIGIT_RE = /[\u0660-\u0669\u06F0-\u06F9]/g
const TO_LATIN_DIGIT: Record<string, string> = {
  "\u0660": "0",
  "\u0661": "1",
  "\u0662": "2",
  "\u0663": "3",
  "\u0664": "4",
  "\u0665": "5",
  "\u0666": "6",
  "\u0667": "7",
  "\u0668": "8",
  "\u0669": "9",
  "\u06F0": "0",
  "\u06F1": "1",
  "\u06F2": "2",
  "\u06F3": "3",
  "\u06F4": "4",
  "\u06F5": "5",
  "\u06F6": "6",
  "\u06F7": "7",
  "\u06F8": "8",
  "\u06F9": "9",
}

function ensureLatinNumerals(s: string): string {
  return s.replace(NON_LATIN_DIGIT_RE, (ch) => TO_LATIN_DIGIT[ch] ?? ch)
}

/** Large gradient strip so `background-position` animation is visible (set only via `backgroundImage` on this layer). */
const GRADIENT_LIGHT =
  "linear-gradient(135deg, #6B0F2A 0%, #8B1538 25%, #A01D42 50%, #B8254D 75%, #C93357 100%)"
const GRADIENT_DARK =
  "linear-gradient(135deg, #4A0A1D 0%, #6B0F2A 25%, #8B1538 50%, #A01D42 75%, #B8254D 100%)"

export function WelcomeCard({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const reduce = useReducedMotion()

  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const languageIsAr =
    i18n.language?.toLowerCase().startsWith("ar") ?? false

  const { dateStr, timeStr } = useMemo(() => {
    if (languageIsAr) {
      const opts = {
        weekday: "long" as const,
        year: "numeric" as const,
        month: "long" as const,
        day: "numeric" as const,
      }
      const timeOpts = {
        hour: "2-digit" as const,
        minute: "2-digit" as const,
        second: "2-digit" as const,
        hour12: true as const,
      }
      let dateStr = currentTime.toLocaleDateString("ar-QA-u-nu-latn", opts)
      let timeStr = currentTime.toLocaleTimeString("ar-QA-u-nu-latn", timeOpts)
      dateStr = ensureLatinNumerals(dateStr)
      timeStr = ensureLatinNumerals(timeStr)
      return { dateStr, timeStr }
    }

    const dateStr = currentTime.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const timeStr = currentTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    return { dateStr, timeStr }
  }, [currentTime, languageIsAr])

  const isDark = resolvedTheme === "dark"

  return (
    <motion.div
      className={cn("relative overflow-hidden rounded-2xl", className)}
      whileHover={
        reduce
          ? undefined
          : {
              y: -2,
              transition: { duration: 0.25, ease: "easeOut" },
            }
      }
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      {/* Full-size animated gradient (separate layer so border/padding never reset background-size) */}
      <div
        className="welcome-card-gradient-anim pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          backgroundImage: isDark ? GRADIENT_DARK : GRADIENT_LIGHT,
        }}
        aria-hidden
      />

      <div className="relative z-[1] rounded-2xl border border-white/20 p-3 shadow-lg sm:p-5 md:p-8">
        <div className="pointer-events-none absolute -end-10 -top-16 size-44 rounded-full bg-[#D4AF37]/18 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -start-8 size-48 rounded-full bg-white/10 blur-3xl" />

        <div
          className={cn(
            "relative flex flex-col gap-3 md:flex-row md:items-start md:gap-10 lg:gap-12",
            !languageIsAr && "md:flex-row-reverse",
          )}
        >
          <section
            className={cn(
              "min-w-0 flex-1 space-y-2 md:space-y-5",
              !languageIsAr && "order-2 md:order-none",
            )}
            dir={i18n.dir()}
            style={{ textShadow: TEXT_SHADOW }}
          >
            <div>
              {/* Single-line title on mobile: nowrap + slight horizontal scroll if needed */}
              <div
                className={cn(
                  "max-md:-mx-0.5 max-md:overflow-x-auto max-md:pb-0.5 md:mx-0 md:overflow-visible",
                  "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-0.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25",
                )}
              >
                <h2
                  className={cn(
                    "w-max min-w-full font-bold leading-tight tracking-tight text-white",
                    "max-md:whitespace-nowrap max-md:text-[11px] max-md:leading-snug",
                    "md:w-auto md:whitespace-normal md:text-2xl md:leading-snug lg:text-[1.65rem]",
                  )}
                >
                  {t("dashboard.welcome.title")}
                </h2>
              </div>
              <p className="mt-1.5 max-w-2xl text-[10px] leading-snug text-white/92 md:mt-3 md:text-base md:leading-relaxed">
                {t("dashboard.welcome.subtitle")}
              </p>
            </div>

            <ul className="max-w-2xl space-y-1 text-[10px] leading-snug text-white/90 md:space-y-2.5 md:text-base md:leading-snug">
              <li className="flex gap-1.5 md:gap-2">
                <span className="shrink-0 text-white/80" aria-hidden>
                  •
                </span>
                <span>{t("dashboard.welcome.point1")}</span>
              </li>
              <li className="flex gap-1.5 md:gap-2">
                <span className="shrink-0 text-white/80" aria-hidden>
                  •
                </span>
                <span>{t("dashboard.welcome.point2")}</span>
              </li>
              <li className="flex gap-1.5 md:gap-2">
                <span className="shrink-0 text-white/80" aria-hidden>
                  •
                </span>
                <span>{t("dashboard.welcome.point3")}</span>
              </li>
            </ul>
          </section>

          <aside
            className={cn(
              "shrink-0 md:w-[min(100%,17.5rem)] lg:w-56",
              !languageIsAr && "order-1 md:order-none",
            )}
            dir={languageIsAr ? "rtl" : "ltr"}
          >
            <div
              className="rounded-xl border border-white/15 bg-black/10 px-2.5 py-2 backdrop-blur-[2px] md:px-5 md:py-4"
              style={{ textShadow: TEXT_SHADOW }}
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-[10px] font-medium leading-relaxed text-white/95 md:text-[15px]">
                {dateStr}
              </p>
              <time
                dateTime={currentTime.toISOString()}
                className="mt-1 block text-xs font-semibold tabular-nums tracking-tight text-white md:mt-2 md:text-xl"
              >
                {timeStr}
              </time>
            </div>
          </aside>
        </div>
      </div>
    </motion.div>
  )
}
