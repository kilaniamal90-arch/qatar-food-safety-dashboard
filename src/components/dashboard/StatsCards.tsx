import { motion, useReducedMotion } from "framer-motion"
import { Building2Icon, ClipboardCheckIcon, LineChartIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCountUp } from "@/hooks/useCountUp"
import { goodOrBetterShare } from "@/lib/inspectionStats"
import { cn } from "@/lib/utils"

export function StatsCards({
  totalEstablishments,
  openEstablishments,
  inspectionCount,
  inspectionsForShare,
  className,
}: {
  totalEstablishments: number
  openEstablishments: number
  inspectionCount: number
  inspectionsForShare: import("@/data/mockBuilder").Inspection[]
  className?: string
}) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()

  const share = goodOrBetterShare(inspectionsForShare)

  const c1 = useCountUp(totalEstablishments, reduce ? 0 : 900, {
    enabled: !reduce,
  })
  const c2 = useCountUp(openEstablishments, reduce ? 0 : 900, {
    enabled: !reduce,
  })
  const c3 = useCountUp(inspectionCount, reduce ? 0 : 1100, {
    enabled: !reduce,
  })
  const c4 = useCountUp(share, reduce ? 0 : 800, { enabled: !reduce })

  const display = reduce
    ? {
        c1: totalEstablishments,
        c2: openEstablishments,
        c3: inspectionCount,
        c4: share,
      }
    : { c1, c2, c3, c4 }

  const items = [
    {
      title: t("dashboard.stats.establishments"),
      value: display.c1,
      suffix: "",
      icon: Building2Icon,
    },
    {
      title: t("dashboard.stats.open"),
      value: display.c2,
      suffix: "",
      icon: Building2Icon,
    },
    {
      title: t("dashboard.stats.inspections"),
      value: display.c3,
      suffix: "",
      icon: ClipboardCheckIcon,
    },
    {
      title: t("dashboard.stats.complianceShare"),
      value: display.c4,
      suffix: "%",
      icon: LineChartIcon,
    },
  ] satisfies ReadonlyArray<{
    title: string
    value: number
    suffix: string
    icon: typeof Building2Icon
  }>

  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {items.map(({ title, value, suffix, icon: Icon }) => (
        <motion.div
          key={title}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="h-full border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <Icon
                className="size-4 text-primary"
                aria-hidden
                strokeWidth={1.75}
              />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">
                {value}
                {suffix}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
