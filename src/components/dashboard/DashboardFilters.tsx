import { CalendarIcon, ChevronDownIcon, Loader2Icon, MapPinIcon, RefreshCwIcon } from "lucide-react"
import type { ElementType } from "react"
import { useTranslation } from "react-i18next"

import type { ManagedArea } from "@/admin/types"
import type { AreaFilter, YearFilter } from "@/data/rawData"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const selectBase = cn(
  "h-10 w-full appearance-none rounded-lg border border-border bg-card",
  "px-4 py-2 pe-9 text-sm font-medium shadow-sm",
  "transition-[border-color,box-shadow,transform] duration-200 hover:border-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "cursor-pointer active:scale-[0.99] motion-reduce:active:scale-100",
)

function IconSelect<T extends string | number>({
  id,
  value,
  options,
  labelFn,
  onChange,
  icon: Icon,
  disabled,
}: {
  id: string
  value: T
  options: readonly T[]
  labelFn: (v: T) => string
  onChange: (v: T) => void
  icon: ElementType
  disabled?: boolean
}) {
  return (
    <div className="relative inline-flex items-center">
      <Icon
        className="pointer-events-none absolute start-3 size-4 text-muted-foreground"
        aria-hidden
      />
      <select
        id={id}
        disabled={disabled}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value
          const parsed = (
            typeof options[0] === "number" ? Number(raw) : raw
          ) as T
          onChange(parsed)
        }}
        className={cn(selectBase, "ps-9", disabled && "cursor-not-allowed opacity-60")}
      >
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {labelFn(opt)}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute end-3 size-4 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}

function areaOptionLabel(
  value: AreaFilter,
  areas: ManagedArea[],
  lang: string,
  t: (key: string) => string,
): string {
  if (value === "all") return t("dashboard.areas.all")
  const row = areas.find((a) => a.nameAr === value || a.nameEn === value)
  if (!row) return String(value)
  return lang === "ar" ? row.nameAr : row.nameEn || row.nameAr
}

export function DashboardFilters({
  year,
  yearOptions,
  yearsLoading,
  area,
  areas,
  areasLoading,
  onYearChange,
  onAreaChange,
  onRefreshAreas,
}: {
  year: YearFilter
  yearOptions: readonly string[]
  yearsLoading: boolean
  area: AreaFilter
  areas: ManagedArea[]
  areasLoading: boolean
  onYearChange: (y: YearFilter) => void
  onAreaChange: (a: AreaFilter) => void
  onRefreshAreas: () => void
}) {
  const { t, i18n } = useTranslation()

  const areaValues: AreaFilter[] = [
    "all",
    ...areas.map((a) => a.nameAr as AreaFilter),
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          {t("dashboard.title")}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Year select */}
        <label htmlFor="dash-year" className="sr-only">
          {t("dashboard.yearLabel")}
        </label>
        <IconSelect
          id="dash-year"
          value={year}
          options={yearOptions.length > 0 ? yearOptions : [String(new Date().getFullYear())]}
          labelFn={(y) => `${t("dashboard.yearLabel")}: ${y}`}
          onChange={onYearChange}
          icon={CalendarIcon}
          disabled={yearsLoading || yearOptions.length === 0}
        />

        {/* Area select */}
        <label htmlFor="dash-area" className="sr-only">
          {t("dashboard.areaLabel")}
        </label>
        <IconSelect
          id="dash-area"
          value={area}
          options={areaValues}
          labelFn={(a) => areaOptionLabel(a, areas, i18n.language, t)}
          onChange={onAreaChange}
          icon={MapPinIcon}
          disabled={areasLoading && areas.length === 0}
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => onRefreshAreas()}
          disabled={areasLoading}
          aria-label={t("dashboard.refreshAreasAria")}
          title={t("dashboard.refreshAreas")}
        >
          {areasLoading ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCwIcon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}
