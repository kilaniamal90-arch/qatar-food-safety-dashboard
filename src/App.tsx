import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/ProtectedRoute"
import { AdminRoute } from "@/components/AdminRoute"
import { AppLayout } from "@/components/layout/AppLayout"
import { ImportRoute } from "@/components/ImportRoute"
import { DashboardPage } from "@/pages/DashboardPage"
import { DataImportPage } from "@/pages/DataImportPage"
import { EstablishmentsPage } from "@/pages/EstablishmentsPage"
import { LoginPage } from "@/pages/LoginPage"
import { SettingsPage } from "@/pages/SettingsPage"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="establishments" element={<EstablishmentsPage />} />

          <Route
            path="import"
            element={
              <ImportRoute>
                <DataImportPage />
              </ImportRoute>
            }
          />
          <Route path="data-import" element={<Navigate to="/import" replace />} />
          <Route path="admin" element={<AdminRoute />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="reports" element={<Navigate to="/dashboard" replace />} />
          <Route path="compliance" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
