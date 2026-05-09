import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ANNOUNCEMENT_ICONS,
  type Announcement,
  mockAnnouncements,
} from "@/data/announcements"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const AUTO_MS = 5000

export function AnnouncementsCarousel({
  className,
  items = mockAnnouncements,
}: {
  className?: string
  items?: Announcement[]
}) {
  const { i18n } = useTranslation()
  const { t } = useTranslation()
  const reducesMotion = useReducedMotion()

  const isAr = useMemo(() => i18n.language?.startsWith("ar"), [i18n.language])

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [dir, setDir] = useState(0)

  const len = items.length

  const go = useCallback(
    (delta: number) => {
      if (len <= 1) return
      setDir(delta)
      setIndex((i) => (i + delta + len) % len)
    },
    [len],
  )

  useEffect(() => {
    if (len <= 1 || paused) return
    const id = window.setInterval(() => {
      setDir(1)
      setIndex((i) => (i + 1) % len)
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [len, paused, index])

  if (len === 0) {
    return null
  }

  const active = items[index % len]!

  const title = isAr ? active.titleAr : active.titleEn
  const body = isAr ? active.textAr : active.textEn
  const ctaLabel =
    active.ctaLink && (isAr ? active.ctaTextAr : active.ctaTextEn)
  const Icon = active.icon ? ANNOUNCEMENT_ICONS[active.icon] : undefined

  const gradientCls = cn(
    "bg-gradient-to-br",
    active.color ?? "from-primary to-[#4A0E1F]",
  )

  const PrevArrow = isAr ? ChevronRight : ChevronLeft
  const NextArrow = isAr ? ChevronLeft : ChevronRight

  const slideVariants = {
    enter: (d: number) =>
      reducesMotion
        ? { opacity: 0, x: 0 }
        : { opacity: 0, x: d >= 0 ? 28 : -28 },
    center: {
      opacity: 1,
      x: 0,
      transition: {
        duration: reducesMotion ? 0 : 0.38,
        ease: [0.22, 0.61, 0.36, 1] as [number, number, number, number],
      },
    },
    exit: (d: number) =>
      reducesMotion
        ? { opacity: 0, x: 0, transition: { duration: 0 } }
        : {
            opacity: 0,
            x: d >= 0 ? -20 : 20,
            transition: {
              duration: 0.28,
              ease: [0.4, 0, 1, 1] as [number, number, number, number],
            },
          },
  }

  return (
    <section
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md",
        className,
      )}
      aria-roledescription={t("dashboard.carousel.roleDescription")}
      aria-label={t("dashboard.carousel.ariaLabel")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
    >
      <div className="relative h-1 w-full overflow-hidden bg-muted">
        <div
          key={index}
          className={cn(
            "h-full origin-left scale-x-0 bg-gradient-to-r from-[#D4AF37] via-primary to-[#D4AF37] rtl:origin-right",
            "motion-reduce:scale-x-100 motion-reduce:animate-none",
            !paused && "animate-carousel-progress",
            paused && "[animation-play-state:paused]",
          )}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("dashboard.carousel.heading")}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full border border-border/80 bg-background/80 transition-[transform,background-color] duration-200 hover:bg-muted active:scale-95 motion-reduce:active:scale-100"
            aria-label={t("dashboard.carousel.prev")}
            onClick={() => go(-1)}
          >
            <PrevArrow className="size-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full border border-border/80 bg-background/80 transition-[transform,background-color] duration-200 hover:bg-muted active:scale-95 motion-reduce:active:scale-100"
            aria-label={t("dashboard.carousel.next")}
            onClick={() => go(1)}
          >
            <NextArrow className="size-5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="relative min-h-[220px] flex-1 sm:min-h-[240px]">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={active.id}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 flex flex-col sm:flex-row"
          >
            <div
              className={cn(
                "relative flex flex-1 flex-col justify-center gap-4 p-6 sm:p-8",
                gradientCls,
                "text-white",
              )}
            >
              <div className="pointer-events-none absolute inset-0 bg-black/10 dark:bg-black/25" />
              <div className="relative flex items-start gap-4">
                {Icon ? (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
                    <Icon className="size-6 text-[#F5E6A8]" aria-hidden />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/90 sm:text-[15px]">
                    {body}
                  </p>
                </div>
              </div>

              {ctaLabel && active.ctaLink ? (
                <div className="relative">
                  <a
                    href={active.ctaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg bg-white/95 px-4 py-2.5 text-sm font-semibold text-primary shadow-md",
                      "transition-[transform,box-shadow,background-color] duration-200",
                      "hover:bg-white hover:shadow-lg active:scale-[0.98] motion-reduce:hover:scale-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    )}
                  >
                    {ctaLabel}
                    <ExternalLink className="size-4 shrink-0 opacity-80" />
                  </a>
                </div>
              ) : null}
            </div>

            {active.image ? (
              <div className="relative h-44 shrink-0 sm:h-auto sm:w-[38%] sm:max-w-md">
                <img
                  src={active.image}
                  alt=""
                  className="size-full object-cover sm:min-h-full"
                  loading="lazy"
                  decoding="async"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent sm:bg-gradient-to-l" />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="flex items-center justify-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-3"
        role="tablist"
        aria-label={t("dashboard.carousel.dotsLabel")}
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={t("dashboard.carousel.goToSlide", { n: i + 1 })}
            className={cn(
              "h-2 rounded-full transition-[width,background-color,opacity] duration-300 ease-out",
              i === index
                ? "w-8 bg-primary opacity-100"
                : "w-2 bg-muted-foreground/35 opacity-80 hover:opacity-100",
            )}
            onClick={() => {
              setDir(i > index ? 1 : -1)
              setIndex(i)
            }}
          />
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {t("dashboard.carousel.slideStatus", {
          current: index + 1,
          total: len,
          title,
        })}
      </p>
    </section>
  )
}
