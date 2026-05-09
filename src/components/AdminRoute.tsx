import { Navigate } from "react-router-dom"

import { useAuth } from "@/auth/AuthContext"
import { AdminPanelPage } from "@/pages/AdminPanelPage"

export function AdminRoute() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <AdminPanelPage />
}
