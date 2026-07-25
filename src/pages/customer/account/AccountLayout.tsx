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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back{customer?.name ? `, ${customer.name}` : ""}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and orders
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <AccountSidebar />
          <div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
