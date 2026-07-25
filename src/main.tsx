import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// ============================================================================
// Lazy-Loaded Layouts & Pages
// ============================================================================

// Customer Layout & Pages
const CustomerLayout = lazy(() => import("@/layouts/customer/CustomerLayout"));
const HomePage = lazy(() => import("@/pages/customer/HomePage"));
const BusinessUnitPage = lazy(() => import("@/pages/customer/BusinessUnitPage"));
const CategoryPage = lazy(() => import("@/pages/customer/CategoryPage"));
const ProductPage = lazy(() => import("@/pages/customer/ProductPage"));
const CartPage = lazy(() => import("@/pages/customer/CartPage"));
const CheckoutPage = lazy(() => import("@/pages/customer/CheckoutPage"));
const OrderTrackingPage = lazy(() => import("@/pages/customer/OrderTrackingPage"));

// Admin Layout & Pages
const AdminLayout = lazy(() => import("@/layouts/admin/AdminLayout"));
const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage"));
const BusinessUnitsPage = lazy(() => import("@/pages/admin/BusinessUnitsPage"));
const CategoriesPage = lazy(() => import("@/pages/admin/CategoriesPage"));
const ProductsPage = lazy(() => import("@/pages/admin/ProductsPage"));
const CombosPage = lazy(() => import("@/pages/admin/CombosPage"));
const PartyPacksPage = lazy(() => import("@/pages/admin/PartyPacksPage"));
const OffersPage = lazy(() => import("@/pages/admin/OffersPage"));
const OrdersPage = lazy(() => import("@/pages/admin/OrdersPage"));
const InventoryPage = lazy(() => import("@/pages/admin/InventoryPage"));
const CustomersPage = lazy(() => import("@/pages/admin/CustomersPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const BannersPage = lazy(() => import("@/pages/admin/BannersPage"));

// Shared Pages
const AuthPage = lazy(() => import("@/pages/Auth.tsx"));
const NotFound = lazy(() => import("@/pages/NotFound.tsx"));

// ============================================================================
// Shared Components
// ============================================================================

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// ============================================================================
// Error Boundaries
// ============================================================================

class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// Convex Client
// ============================================================================

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// ============================================================================
// Route Syncer (for iframe communication)
// ============================================================================

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

// ============================================================================
// Routes exported as a component (required for lazy loading layouts)
// ============================================================================

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        {/* ============ Customer Routes ============ */}
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/:businessUnitSlug" element={<BusinessUnitPage />} />
          <Route path="/:businessUnitSlug/:categorySlug" element={<CategoryPage />} />
          <Route
            path="/:businessUnitSlug/:categorySlug/:productSlug"
            element={<ProductPage />}
          />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/track-order" element={<OrderTrackingPage />} />
        </Route>

        {/* ============ Admin Routes ============ */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="business-units" element={<BusinessUnitsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="combos" element={<CombosPage />} />
          <Route path="party-packs" element={<PartyPacksPage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="banners" element={<BannersPage />} />
        </Route>

        {/* ============ Auth ============ */}
        <Route path="/auth" element={<AuthPage redirectAfterAuth="/" />} />

        {/* ============ 404 ============ */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

// ============================================================================
// Bootstrap
// ============================================================================

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
