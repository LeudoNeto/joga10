import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "./ui";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Carregando..." className="min-h-screen" />;
  if (!user) {
    const isJoin =
      location.pathname.startsWith("/join/") || location.pathname.startsWith("/invite/");
    const target = isJoin ? "/signup" : "/login";
    return <Navigate to={target} replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
