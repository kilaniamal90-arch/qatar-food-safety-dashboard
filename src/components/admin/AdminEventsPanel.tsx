import {
  ArrowDownIcon,
  ArrowUpIcon,
  BellIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"

import type { ManagedEvent } from "@/admin/types"
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDelete"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAllEvents } from "@/hooks/useEvents"
import { useYears } from "@/hooks/useYears"
import { useDebounce } from "@/hooks/useDebounce"
import { toIsoDateLocal } from "@/lib/dateIsoLocal"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type SortKey = "date" | "area" | "year" | "status" | "title"
type SortDir = "asc" | "desc"

function eventAreaDisplay(ev: ManagedEvent, langAr: boolean): string {
  const primary = langAr ? ev.areaNameAr : ev.areaNameEn
  if (primary?.trim()) return primary.trim()
  const fb = langAr ? ev.areaNameEn : ev.areaNameAr
  if (fb?.trim()) return fb.trim()
  return "—"
}

const tableWrap =
  "overflow-x-auto rounded-xl border border-border shadow-sm"
const thClass =
  "border-b border-border bg-muted/50 px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
const tdClass = "border-b border-border px-3 py-2.5 text-sm align-middle"

function selectClass(rtl: boolean) {
  return cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    rtl ? "text-end" : "text-start",
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  rtl,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
  rtl: boolean
}) {
  return (
    <th className={thClass} scope="col">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-foreground",
          rtl && "flex-row-reverse",
        )}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUpIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
          ) : (
            <ArrowDownIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  )
}

export function AdminEventsPanel() {
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"
  const langAr = i18n.language?.toLowerCase().startsWith("ar")

  const { data: events, loading, error: queryError, refetch } = useAllEvents()
  const { data: activeYearRows, loading: activeYearsLoading } = useYears()

  const activeYearSet = useMemo(
    () => new Set(activeYearRows.map((r) => r.year)),
    [activeYearRows],
  )

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  const [filterAreaText, setFilterAreaText] = useState("")
  const debouncedFilterArea = useDebounce(filterAreaText, 300)
  const [filterYear, setFilterYear] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">(
    "all",
  )
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedEvent | null>(null)
  const [titleAr, setTitleAr] = useState("")
  const [titleEn, setTitleEn] = useState("")
  const [descriptionAr, setDescriptionAr] = useState("")
  const [descriptionEn, setDescriptionEn] = useState("")
  const [areaNameAr, setAreaNameAr] = useState("")
  const [areaNameEn, setAreaNameEn] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [icon, setIcon] = useState("🎯")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  const yearOptions = useMemo(() => {
    return [...activeYearSet].sort((a, b) => b - a)
  }, [activeYearSet])

  useEffect(() => {
    if (filterYear === "all" || activeYearsLoading) return
    const y = Number.parseInt(filterYear, 10)
    if (!activeYearSet.has(y)) setFilterYear("all")
  }, [filterYear, activeYearSet, activeYearsLoading])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "date" ? "desc" : "asc")
    }
  }

  const filteredSorted = useMemo(() => {
    let list = [...events]
    if (!activeYearsLoading) {
      if (activeYearSet.size === 0) {
        list = []
      } else {
        list = list.filter((e) => activeYearSet.has(e.year))
      }
    }
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (e) =>
          e.titleAr.toLowerCase().includes(q) ||
          e.titleEn.toLowerCase().includes(q),
      )
    }
    if (filterYear !== "all") {
      const y = Number.parseInt(filterYear, 10)
      list = list.filter((e) => e.year === y)
    }
    if (debouncedFilterArea.trim()) {
      const aq = debouncedFilterArea.trim().toLowerCase()
      list = list.filter(
        (e) =>
          (e.areaNameAr ?? "").toLowerCase().includes(aq) ||
          (e.areaNameEn ?? "").toLowerCase().includes(aq),
      )
    }
    if (filterStatus === "active") list = list.filter((e) => e.isActive)
    if (filterStatus === "inactive") list = list.filter((e) => !e.isActive)

    const dir = sortDir === "asc" ? 1 : -1
    list.sort((a, b) => {
      let c = 0
      switch (sortKey) {
        case "date":
          c = a.eventDate.localeCompare(b.eventDate)
          break
        case "year":
          c = a.year - b.year
          break
        case "status":
          c = Number(a.isActive) - Number(b.isActive)
          break
        case "area": {
          const an = eventAreaDisplay(a, langAr)
          const bn = eventAreaDisplay(b, langAr)
          c = an.localeCompare(bn, langAr ? "ar" : "en")
          break
        }
        case "title": {
          const at = langAr ? a.titleAr : a.titleEn
          const bt = langAr ? b.titleAr : b.titleEn
          c = at.localeCompare(bt, langAr ? "ar" : "en")
          break
        }
        default:
          c = 0
      }
      return c * dir
    })
    return list
  }, [
    events,
    debouncedSearch,
    filterYear,
    debouncedFilterArea,
    filterStatus,
    sortKey,
    sortDir,
    langAr,
    activeYearSet,
    activeYearsLoading,
  ])

  function resetForm(e?: ManagedEvent | null) {
    setEditing(e ?? null)
    setTitleAr(e?.titleAr ?? "")
    setTitleEn(e?.titleEn ?? "")
    setDescriptionAr(e?.descriptionAr ?? "")
    setDescriptionEn(e?.descriptionEn ?? "")
    setAreaNameAr(e?.areaNameAr ?? "")
    setAreaNameEn(e?.areaNameEn ?? "")
    setEventDate(e?.eventDate ?? toIsoDateLocal(new Date()))
    setIcon(e?.icon ?? "🎯")
    setIsActive(e?.isActive ?? true)
    setFormError(null)
  }

  function openAdd() {
    resetForm(null)
    setDialogOpen(true)
  }

  function openEdit(ev: ManagedEvent) {
    resetForm(ev)
    setDialogOpen(true)
  }

  async function save() {
    if (!titleAr.trim()) {
      setFormError(t("admin.validation.eventsTitleAr"))
      return
    }
    if (!titleEn.trim()) {
      setFormError(t("admin.validation.eventsTitleEn"))
      return
    }
    if (!eventDate) {
      setFormError(t("admin.validation.eventsDate"))
      return
    }
    const calYear = Number.parseInt(eventDate.slice(0, 4), 10)
    if (!Number.isFinite(calYear)) {
      setFormError(t("admin.validation.eventsDate"))
      return
    }
    if (!activeYearSet.has(calYear)) {
      setFormError(t("admin.validation.eventsYearActive"))
      return
    }

    setSaving(true)
    setFormError(null)
    const payload = {
      title_ar: titleAr.trim(),
      title_en: titleEn.trim(),
      description_ar: descriptionAr.trim() || null,
      description_en: descriptionEn.trim() || null,
      area_name_ar: areaNameAr.trim() || null,
      area_name_en: areaNameEn.trim() || null,
      event_date: eventDate,
      year: calYear,
      icon: icon.trim() || "🎯",
      is_active: isActive,
    }
    const res = editing
      ? await supabase.from("events").update(payload).eq("id", editing.id)
      : await supabase.from("events").insert(payload)
    setSaving(false)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    await refetch()
    setDialogOpen(false)
    toast.success(t("admin.common.success"))
  }

  async function toggleRowActive(id: string, next: boolean) {
    const { error } = await supabase.from("events").update({ is_active: next }).eq("id", id)
    if (error) {
      toast.error(error.message)
      return
    }
    await refetch()
    toast.success(t("admin.common.success"))
  }

  function titleFor(ev: ManagedEvent) {
    return langAr ? ev.titleAr : ev.titleEn
  }

  function areaLabel(ev: ManagedEvent) {
    return eventAreaDisplay(ev, langAr)
  }

  return (
    <Card className="border-border p-5 shadow-md">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2">
          <BellIcon className="mt-1 size-6 text-primary" aria-hidden />
          <div>
            <h2 className="text-lg font-bold">{t("admin.tabs.events")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.tabs.eventsHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void refetch()}
          >
            <RefreshCwIcon className="size-3.5" />
            {t("admin.events.refresh")}
          </Button>
          <Button variant="gold" className="gap-2 shrink-0" onClick={() => openAdd()}>
            <PlusIcon className="size-4" />
            {t("admin.events.addEvent")}
          </Button>
        </div>
      </div>

      <div
        className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 md:flex-row md:flex-wrap md:items-end"
        dir={rtl ? "rtl" : "ltr"}
      >
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <Label className={cn("text-xs", rtl && "block text-end")}>
            {t("admin.events.search")}
          </Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.events.searchPlaceholder")}
          />
        </div>
        <div className="w-full min-w-[8rem] space-y-1.5 md:w-36">
          <Label className={cn("text-xs", rtl && "block text-end")}>
            {t("admin.events.filterYear")}
          </Label>
          <select
            className={selectClass(rtl)}
            value={filterYear}
            disabled={activeYearsLoading}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="all">{t("admin.events.allYears")}</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full min-w-[8rem] flex-1 space-y-1.5 md:min-w-[12rem]">
          <Label className={cn("text-xs", rtl && "block text-end")}>
            {t("admin.events.filterArea")}
          </Label>
          <Input
            value={filterAreaText}
            onChange={(e) => setFilterAreaText(e.target.value)}
            placeholder={t("admin.events.filterAreaPlaceholder")}
          />
        </div>
        <div className="w-full min-w-[8rem] space-y-1.5 md:w-40">
          <Label className={cn("text-xs", rtl && "block text-end")}>
            {t("admin.events.filterStatus")}
          </Label>
          <select
            className={selectClass(rtl)}
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as "all" | "active" | "inactive")
            }
          >
            <option value="all">{t("admin.events.statusAll")}</option>
            <option value="active">{t("admin.users.active")}</option>
            <option value="inactive">{t("admin.users.inactive")}</option>
          </select>
        </div>
      </div>

      {queryError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {queryError}
        </p>
      ) : null}

      <div className={tableWrap} dir={rtl ? "rtl" : "ltr"}>
        <table className="w-full min-w-[800px] text-start">
          <thead>
            <tr>
              <th className={thClass}>{t("admin.events.colIcon")}</th>
              <SortHeader
                label={t("admin.events.colTitle")}
                active={sortKey === "title"}
                dir={sortDir}
                onClick={() => toggleSort("title")}
                rtl={rtl}
              />
              <SortHeader
                label={t("admin.events.colArea")}
                active={sortKey === "area"}
                dir={sortDir}
                onClick={() => toggleSort("area")}
                rtl={rtl}
              />
              <SortHeader
                label={t("admin.events.colDate")}
                active={sortKey === "date"}
                dir={sortDir}
                onClick={() => toggleSort("date")}
                rtl={rtl}
              />
              <SortHeader
                label={t("admin.events.colYear")}
                active={sortKey === "year"}
                dir={sortDir}
                onClick={() => toggleSort("year")}
                rtl={rtl}
              />
              <SortHeader
                label={t("admin.events.colActive")}
                active={sortKey === "status"}
                dir={sortDir}
                onClick={() => toggleSort("status")}
                rtl={rtl}
              />
              <th className={cn(thClass, "text-end")}>{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  <Skeleton className="h-10 w-full" />
                </td>
              </tr>
            ) : filteredSorted.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("admin.events.empty")}
                  </p>
                </td>
              </tr>
            ) : (
              filteredSorted.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/40">
                  <td className={cn(tdClass, "text-xl")} title={ev.icon}>
                    {ev.icon || "🎯"}
                  </td>
                  <td className={tdClass}>
                    <span className="font-medium">{titleFor(ev)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {langAr ? ev.titleEn : ev.titleAr}
                    </span>
                  </td>
                  <td className={tdClass}>{areaLabel(ev)}</td>
                  <td className={tdClass}>
                    {new Date(ev.eventDate + "T12:00:00").toLocaleDateString(
                      langAr ? "ar-QA-u-nu-latn" : "en-US",
                    )}
                  </td>
                  <td className={tdClass}>{ev.year}</td>
                  <td className={tdClass}>
                    <Switch
                      dir={rtl ? "rtl" : "ltr"}
                      checked={ev.isActive}
                      onCheckedChange={(v) => void toggleRowActive(ev.id, v)}
                      aria-label={t("admin.events.toggleActive")}
                    />
                  </td>
                  <td className={cn(tdClass, "text-end")}>
                    <div
                      className={cn(
                        "flex flex-wrap gap-2",
                        rtl ? "justify-start" : "justify-end",
                      )}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => openEdit(ev)}
                      >
                        <PencilIcon className="size-3.5" /> {t("admin.common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                        onClick={() => {
                          setDelId(ev.id)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !saving && setDialogOpen(o)}>
        <DialogContent className="max-w-lg sm:max-w-xl" dir={rtl ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={rtl ? "text-end" : "text-start"}>
              {editing ? t("admin.common.edit") : t("admin.events.addEvent")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.titleAr")}
              </Label>
              <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.titleEn")}
              </Label>
              <Input
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.descriptionAr")}
              </Label>
              <Textarea value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.descriptionEn")}
              </Label>
              <Textarea
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                dir="ltr"
                className="text-start"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.areaNameAr")}
              </Label>
              <p className={cn("text-xs text-muted-foreground", rtl && "text-end")}>
                {t("admin.events.areaNameArHint")}
              </p>
              <Input value={areaNameAr} onChange={(e) => setAreaNameAr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>
                {t("admin.events.areaNameEn")}
              </Label>
              <p className={cn("text-xs text-muted-foreground", rtl && "text-end")}>
                {t("admin.events.areaNameEnHint")}
              </p>
              <Input
                value={areaNameEn}
                onChange={(e) => setAreaNameEn(e.target.value)}
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className={cn(rtl && "block text-end")}>{t("admin.events.eventDate")}</Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(rtl && "block text-end")}>{t("admin.events.yearComputed")}</Label>
                <Input
                  readOnly
                  value={eventDate ? eventDate.slice(0, 4) : "—"}
                  className="bg-muted"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className={cn(rtl && "block text-end")}>{t("admin.events.icon")}</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="max-w-[8rem]" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <Label
                htmlFor="adm-event-active"
                className={cn("flex-1 leading-snug", rtl ? "text-end" : "text-start")}
              >
                {t("admin.users.active")}
              </Label>
              <Switch
                id="adm-event-active"
                dir={rtl ? "rtl" : "ltr"}
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
            {formError ? (
              <p
                className={cn("text-sm font-medium text-red-600", rtl && "text-end")}
                role="alert"
              >
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter className={rtl ? "sm:flex-row-reverse sm:justify-start" : undefined}>
            <Button variant="outline" type="button" disabled={saving} onClick={() => setDialogOpen(false)}>
              {t("admin.common.cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("admin.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("admin.common.confirmDelete")}
        description={t("admin.events.deleteConfirm")}
        cancelLabel={t("admin.common.cancel")}
        confirmLabel={t("admin.common.delete")}
        busy={busyDelete}
        onConfirm={async () => {
          if (!delId) return
          setBusyDelete(true)
          const { error } = await supabase.from("events").delete().eq("id", delId)
          setBusyDelete(false)
          setDelId(null)
          setDeleteOpen(false)
          if (error) {
            toast.error(error.message)
            return
          }
          await refetch()
          toast.success(t("admin.common.success"))
        }}
      />
    </Card>
  )
}
