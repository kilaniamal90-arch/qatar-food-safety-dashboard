import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

function formatTrendDisplayPct(n: number): string {
  const r = Math.round(n * 10) / 10
  if (r === 0) return "0.0%"
  if (r > 0) return `+${r}%`
  return `${r}%`
}

export function TrendBadge({ trendPct }: { trendPct: number }) {
  const { t } = useTranslation()
  const rounded = Math.round(trendPct * 10) / 10
  const isPos = rounded > 0
  const isNeg = rounded < 0
  const isZero = rounded === 0
  const absPct = Math.abs(rounded).toFixed(1)

  const ariaLabel =
    isPos
      ? t("dashboard.trendAriaUp", { pct: absPct })
      : isNeg
        ? t("dashboard.trendAriaDown", { pct: absPct })
        : t("dashboard.trendAriaSame")

  const Icon = isPos ? TrendingUpIcon : isNeg ? TrendingDownIcon : MinusIcon

  return (
    <div
      className={cn(
        "trend-badge-pulse inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
        isPos &&
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        isNeg && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        isZero && "bg-muted text-muted-foreground",
      )}
      role="status"
      aria-label={ariaLabel}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="tabular-nums">
        {formatTrendDisplayPct(rounded)} {t("dashboard.fromLastYear")}
      </span>
    </div>
  )
}
