import { ShieldCheckIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  AdminAreasPanel,
  AdminInspectorsPanel,
  AdminPeriodsPanel,
  AdminRatingsPanel,
  AdminStatusesPanel,
  AdminUsersPanel,
  AdminYearsPanel,
} from "@/components/admin/AdminDataPanels"
import { AdminEventsPanel } from "@/components/admin/AdminEventsPanel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const TAB_IDS = [
  "users",
  "areas",
  "ratings",
  "years",
  "statuses",
  "periods",
  "inspectors",
  "events",
] as const

export function AdminPanelPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<string>("users")
  const rtl = i18n.dir() === "rtl"

  const orderedTabIds = useMemo(
    () => (rtl ? [...TAB_IDS].reverse() : [...TAB_IDS]),
    [rtl],
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 animate-in fade-in duration-300">
      <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200/95 bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-200/90 p-6 text-zinc-900 shadow-md shadow-zinc-300/30 dark:border-primary/40 dark:from-primary dark:via-card dark:to-card dark:text-white dark:shadow-primary/25">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-xl border border-[#8B1538]/35 bg-[#8B1538]/10 shadow-inner dark:border-[#D4AF37]/50 dark:bg-black/35">
            <ShieldCheckIcon className="size-8 text-[#6B1229] dark:text-[#F5E6A8]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold tracking-tight text-zinc-950 dark:text-white dark:drop-shadow-sm">
              <span className="flex flex-col gap-1 sm:hidden">
                <span className="text-lg font-semibold leading-snug text-[#722F37] dark:text-[#EDE4C7]/95">
                  {t("admin.titleLead")}
                </span>
                <span className="text-2xl font-bold leading-tight">{t("admin.titleMain")}</span>
              </span>
              <span className="hidden sm:block text-3xl">{t("admin.title")}</span>
            </h1>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList dir={rtl ? "rtl" : "ltr"} className="max-md:pb-3">
          {orderedTabIds.map((id) => (
            <TabsTrigger key={id} value={id} className={cn(rtl && "text-start md:text-start")}>
              {t(`admin.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="users">
          <AdminUsersPanel />
        </TabsContent>
        <TabsContent value="areas">
          <AdminAreasPanel />
        </TabsContent>
        <TabsContent value="ratings">
          <AdminRatingsPanel />
        </TabsContent>
        <TabsContent value="years">
          <AdminYearsPanel />
        </TabsContent>
        <TabsContent value="statuses">
          <AdminStatusesPanel />
        </TabsContent>
        <TabsContent value="periods">
          <AdminPeriodsPanel />
        </TabsContent>
        <TabsContent value="inspectors">
          <AdminInspectorsPanel />
        </TabsContent>
        <TabsContent value="events">
          <AdminEventsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
