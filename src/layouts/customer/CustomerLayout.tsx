import { useMemo } from "react";
import { Outlet } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@convex/_generated/api";

import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

import { CustomerNavbar } from "./CustomerNavbar";
import { CustomerFooter } from "./CustomerFooter";

import type { BusinessUnit, BusinessUnitSettings } from "@/types";

export function CustomerLayout() {
  const businessUnits =
    (useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined) ?? [];
  const { itemCount } = useCart();
  const { isAuthenticated, user, signOut } = useAuth();

  const buIds = useMemo(
    () => businessUnits.map((bu) => bu._id),
    [businessUnits],
  );

  const s1 = useQuery(
    api.settings.getBusinessUnitSettings,
    buIds[0] ? { businessUnitId: buIds[0] as any } : "skip",
  );
  const s2 = useQuery(
    api.settings.getBusinessUnitSettings,
    buIds[1] ? { businessUnitId: buIds[1] as any } : "skip",
  );
  const s3 = useQuery(
    api.settings.getBusinessUnitSettings,
    buIds[2] ? { businessUnitId: buIds[2] as any } : "skip",
  );

  const settingsMap = useMemo(() => {
    const map = new Map<string, BusinessUnitSettings>();
    if (s1) map.set(buIds[0]!, s1 as BusinessUnitSettings);
    if (s2) map.set(buIds[1]!, s2 as BusinessUnitSettings);
    if (s3) map.set(buIds[2]!, s3 as BusinessUnitSettings);
    return map;
  }, [buIds, s1, s2, s3]);

  return (
    <div className="flex min-h-screen flex-col">
      <CustomerNavbar
        businessUnits={businessUnits}
        cartItemCount={itemCount}
        settingsMap={settingsMap}
        isAuthenticated={isAuthenticated}
        user={user}
        onSignOut={() => signOut()}
      />
      <main className="flex-1">
        <Outlet />
      </main>
      <CustomerFooter />
    </div>
  );
}

export default CustomerLayout;
