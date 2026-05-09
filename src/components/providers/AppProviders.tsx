import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

import { AuthProvider } from "@/auth/AuthContext"
import { ToastHost } from "@/components/providers/ToastHost"

import i18n from "@/i18n/config"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <ToastHost />
          {children}
        </AuthProvider>
      </NextThemesProvider>
    </I18nextProvider>
  )
}
