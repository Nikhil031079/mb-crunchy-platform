import { Outlet } from "react-router";
import { useKitchenAuth } from "@/hooks/use-kitchen-auth";
import { Navigate } from "react-router";

export function KitchenLayout() {
  const { isAuthenticated, isLoading } = useKitchenAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/kitchen/login" replace />;
  }

  return <Outlet />;
}

export default KitchenLayout;