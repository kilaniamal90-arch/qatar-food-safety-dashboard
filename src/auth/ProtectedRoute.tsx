import { Loader2Icon } from "lucide-react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/auth/AuthContext"

export function ProtectedRoute() {
  const { isAuthenticated, authReady } = useAuth()
  const location = useLocation()

  if (!authReady) {
    return (
      <div
        className="relative flex min-h-svh w-full items-center justify-center overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#6B0F2A] via-[#4a0b1f] to-[#B8860B]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:20px_20px] opacity-90"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/20"
          aria-hidden
        />
        <Loader2Icon className="relative z-10 size-10 animate-spin text-white/90" aria-hidden />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
