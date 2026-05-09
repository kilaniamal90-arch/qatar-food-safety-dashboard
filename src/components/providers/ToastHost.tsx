import { Toaster } from "react-hot-toast"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

export function ToastHost() {
  const { resolvedTheme } = useTheme()
  const { i18n } = useTranslation()
  const isDark = resolvedTheme === "dark"

  return (
    <Toaster
      containerStyle={{
        direction: i18n.dir(),
      }}
      toastOptions={{
        duration: 4000,
        className:
          "!font-sans !text-sm !shadow-lg !border !border-border !rounded-xl",
        style: {
          background: isDark ? "#1e293b" : "#ffffff",
          color: isDark ? "#f1f5f9" : "#111827",
        },
        success: {
          iconTheme: {
            primary: "#8B1538",
            secondary: "#ffffff",
          },
        },
      }}
      position="bottom-center"
      gutter={12}
      reverseOrder={false}
    />
  )
}
