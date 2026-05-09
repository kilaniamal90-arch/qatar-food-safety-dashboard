import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { InspectionRating } from "@/data/mockBuilder"

type Row = { rating: InspectionRating; count: number }

export function RatingsChart({
  data,
  className,
}: {
  data: Row[]
  className?: string
}) {
  const { t } = useTranslation()
  const hasData = data.some((d) => d.count > 0)

  const localized = data.map((d) => ({
    ...d,
    label: t(`dashboard.ratings.${d.rating}` as const),
  }))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.chart.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.chart.caption")}
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.chart.empty")}</p>
        ) : (
          <div
            className="h-72 w-full min-w-0"
            dir="ltr"
            aria-label={t("dashboard.chart.title")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={localized}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Bar
                  dataKey="count"
                  name={t("dashboard.stats.inspections")}
                  fill="var(--primary)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
