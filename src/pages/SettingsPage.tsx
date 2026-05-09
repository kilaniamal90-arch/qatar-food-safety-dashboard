import { useTranslation } from "react-i18next"

import type { SessionRole } from "@/auth/session"
import { SESSION_ROLES } from "@/auth/session"
import { useAuth } from "@/auth/AuthContext"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useAreas } from "@/hooks/useAreas"
import { cn } from "@/lib/utils"

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language.startsWith("ar")
  const { user, setRoleDev, setAssignedAreaIdsDev } = useAuth()
  const { data: areaRows, loading: areasLoading } = useAreas()

  const areaNeedsAssignment =
    user.role === "inspector" || user.role === "supervisor"

  const toggleArea = (areaId: string) => {
    const set = new Set(user.areas)
    if (set.has(areaId)) set.delete(areaId)
    else set.add(areaId)
    setAssignedAreaIdsDev([...set])
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-10">
      <Card className="border-border p-6 shadow-md">
        <h2 className="mb-4 text-xl font-bold text-foreground">
          {t("settings.general")}
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("settings.devRoleIntro")}
        </p>
        <div className="space-y-2">
          <Label htmlFor="dev-role">{t("settings.demoRoleLabel")}</Label>
          <select
            id="dev-role"
            value={user.role}
            onChange={(e) => setRoleDev(e.target.value as SessionRole)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {SESSION_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`settings.roles.${role}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("settings.demoRoleHint")}</p>
        </div>
      </Card>

      {areaNeedsAssignment ? (
        <Card className="border-border p-6 shadow-md">
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            {t("settings.assignedAreasLabel")}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("settings.assignedAreasHint")}
          </p>
          <div
            className={cn(
              "max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3",
              areasLoading && "opacity-60",
            )}
          >
            {areaRows.map((a) => {
              const label = isRtl
                ? (a.nameAr || a.nameEn).trim()
                : (a.nameEn || a.nameAr).trim()
              return (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={user.areas.includes(a.id)}
                    onChange={() => toggleArea(a.id)}
                    disabled={areasLoading}
                  />
                  <span>{label || a.id}</span>
                </label>
              )
            })}
            {!areasLoading && areaRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
