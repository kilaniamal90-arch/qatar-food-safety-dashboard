import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"

import { useAuth } from "@/auth/AuthContext"

export function ImportRoute({ children }: { children: ReactNode }) {
  const { canImport } = useAuth()
  if (!canImport) return <Navigate to="/dashboard" replace />
  return children
}
