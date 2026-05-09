import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/coming-soon/ComingSoon"

type NavKey =
  | "nav.establishments"
  | "nav.importData"
  | "nav.admin"
  | "nav.settings"

export function PlaceholderPage({ navKey }: { navKey: NavKey }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-6xl py-10">
      <ComingSoon label={t(navKey)} />
    </div>
  )
}
