import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";

import { useAuth } from "@/hooks/use-auth";
import { SITE_NAME, ROUTES } from "@/constants";

import { AccountSidebar } from "@/components/customer/account/AccountSidebar";

export default function AccountLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const customer = useQuery(
    api.customers.getByAuthUser,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    document.title = `My Account | ${SITE_NAME}`;
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(ROUTES.AUTH);
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen culinary-canvas flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen culinary-canvas">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            My Account
          </p>
          <h1 className="font-culinary-heading mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back{customer?.name ? `, ${customer.name}` : ""}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and orders
          </p>
        </div>

        <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[240px_1fr]">
          <AccountSidebar />
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
