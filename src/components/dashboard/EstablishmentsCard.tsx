import { Building2Icon } from "lucide-react"
import { useRef, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import type { StatusEntry, StatusTKey } from "@/data/processData"
import { useCountUp } from "@/hooks/useCountUp"
import { useIntersection } from "@/hooks/useIntersection"
import { cn, fmtNum, fmtPct } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STATUS_EMOJIS: Record<StatusTKey, string> = {
  "dashboard.open": "🟢",
  "dashboard.closed": "🔴",
  "dashboard.temporaryClosed": "🟡",
  "dashboard.openSoon": "🟣",
  "dashboard.statusUndetermined": "⚪",
}

function StatusBarRow({
  entry,
  totalForShare,
  animate,
}: {
  entry: StatusEntry
  totalForShare: number
  animate: boolean
}) {
  const { t } = useTranslation()
  const barPct = totalForShare > 0 ? (entry.count / totalForShare) * 100 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span role="img" aria-hidden className="text-base leading-none">
            {STATUS_EMOJIS[entry.tKey] ?? "📋"}
          </span>
          {t(entry.tKey)}
        </span>
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {fmtNum(entry.count)} ({fmtPct(entry.percentage)})
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
        {animate ? (
          <div
            className="progress-animated h-full rounded-full"
            style={
              {
                "--target-width": `${barPct.toFixed(2)}%`,
                background: entry.gradient,
              } as CSSProperties
            }
          />
        ) : (
          <div
            className="h-full rounded-full"
            style={{ width: "0%", background: entry.gradient }}
          />
        )}
      </div>
    </div>
  )
}

export function EstablishmentsCard({
  total,
  statusBreakdown,
  className,
}: {
  total: number
  statusBreakdown: StatusEntry[]
  className?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const visible = useIntersection(ref, { threshold: 0.1 })
  const displayedTotal = fmtNum(useCountUp(total, 1400, { enabled: visible }))

  const totalStatus = statusBreakdown.reduce((s, e) => s + e.count, 0)

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
          <p className="mb-4 text-sm font-semibold text-foreground">
            {t("dashboard.statusDistribution")}
          </p>
          <div className="space-y-4">
            {statusBreakdown.map((entry) => (
              <StatusBarRow
                key={entry.tKey}
                entry={entry}
                totalForShare={totalStatus}
                animate={visible}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
