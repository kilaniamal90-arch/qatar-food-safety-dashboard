import { MapPinIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Establishment } from "@/data/mockBuilder"
import { cn } from "@/lib/utils"

function statusVariant(
  s: Establishment["status"],
): "success" | "warning" | "secondary" {
  if (s === "Open") return "success"
  if (s === "Under Review") return "warning"
  return "secondary"
}

export function EstablishmentCard({
  e,
  className,
}: {
  e: Establishment
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <Card className={cn("h-full border-border/80 shadow-sm", className)}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{e.name}</CardTitle>
          <Badge variant={statusVariant(e.status)}>
            {t(
              `establishments.statusLabel.${e.status}` as
                | "establishments.statusLabel.Open"
                | "establishments.statusLabel.Closed"
                | "establishments.statusLabel.Under Review",
            )}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("establishments.card.cr")}: {e.crNumber}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-start gap-2 text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium text-foreground">{e.area}</p>
            <p>
              {t("establishments.card.location")}: {e.location}
            </p>
            <p>
              {t("establishments.card.activity")}: {e.activityType}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
