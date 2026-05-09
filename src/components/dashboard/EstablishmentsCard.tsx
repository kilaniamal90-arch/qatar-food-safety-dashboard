import { Building2Icon } from "lucide-react"
import { useRef } from "react"
import { useTranslation } from "react-i18next"

import type { RatingEntry, RatingTKey } from "@/data/processData"
import { useCountUp } from "@/hooks/useCountUp"
import { useIntersection } from "@/hooks/useIntersection"
import { cn, fmtNum, fmtPct } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ─── Rating emojis (keyed by tKey for locale-independence) ───────────────────

const RATING_EMOJIS: Record<RatingTKey, string> = {
  "dashboard.excellent": "⭐⭐⭐",
  "dashboard.veryGood": "⭐⭐",
  "dashboard.good": "⭐",
  "dashboard.fair": "⚠️",
  "dashboard.poor": "❌",
  "dashboard.veryPoor": "🔴",
}

// ─── Mini card (rating) ───────────────────────────────────────────────────────

function RatingMiniCard({ entry, idx }: { entry: RatingEntry; idx: number }) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        `mini-card-${idx + 1}`,
        "group flex flex-col items-center gap-1.5 rounded-xl p-4 text-white shadow-sm",
        "cursor-default select-none",
        "transition-[transform,box-shadow] duration-250 will-change-transform motion-reduce:will-change-auto",
        "hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.22)] motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-sm",
      )}
      style={{ background: entry.gradient }}
    >
      <span className="text-xl leading-none" role="img" aria-hidden>
        {RATING_EMOJIS[entry.tKey] ?? "📋"}
      </span>
      <span className="text-xs font-semibold leading-tight text-center">
        {t(entry.tKey)}
      </span>
      <span className="text-2xl font-bold tabular-nums leading-tight">
        {fmtNum(entry.count)}
      </span>
      <span className="text-xs font-medium opacity-85">
        {fmtPct(entry.percentage)}
      </span>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function EstablishmentsCard({
  total,
  ratingBreakdown,
  className,
}: {
  total: number
  ratingBreakdown: RatingEntry[]
  className?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useIntersection(ref, { threshold: 0.1 })
  const displayedTotal = fmtNum(useCountUp(total, 1400, { enabled: visible }))

  return (
    <Card
      ref={ref}
      id="establishments-overview"
      className={cn(
        "border-border/70 shadow-sm",
        "transition-[transform,box-shadow] duration-300 will-change-transform motion-reduce:will-change-auto",
        "hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(139,21,56,0.15)] motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-sm",
        className,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Building2Icon className="size-5 text-primary" aria-hidden />
          {t("dashboard.establishments.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <span className="block text-5xl font-bold tabular-nums tracking-tight text-foreground">
            {displayedTotal}
          </span>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.registeredEstablishments")}
          </p>
        </div>

        <hr className="border-border/60" />

        <div>
          <p className="mb-3 text-sm font-semibold text-foreground">
            {t("dashboard.ratingsDistribution")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ratingBreakdown.map((entry, idx) => (
              <RatingMiniCard key={entry.tKey} entry={entry} idx={idx} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
