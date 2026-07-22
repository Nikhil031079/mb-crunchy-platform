import type { BusinessUnit } from "./types";

/** Temporary client-side source. Replace this export with a Convex query adapter. */
export const mockBusinessUnits: BusinessUnit[] = [
  { id: "bu-1", name: "MB Kitchen", slug: "mb-kitchen", status: "active", homepageVisible: true, themeColor: "#E85D04", displayOrder: 1 },
  { id: "bu-2", name: "MB Mart", slug: "mb-mart", status: "active", homepageVisible: true, themeColor: "#0F766E", displayOrder: 2 },
  { id: "bu-3", name: "MB Bakery", slug: "mb-bakery", status: "inactive", homepageVisible: false, themeColor: "#A16207", displayOrder: 3 },
  { id: "bu-4", name: "MB Fresh", slug: "mb-fresh", status: "active", homepageVisible: true, themeColor: "#16A34A", displayOrder: 4 },
  { id: "bu-5", name: "MB Express", slug: "mb-express", status: "inactive", homepageVisible: false, themeColor: "#2563EB", displayOrder: 5 },
  { id: "bu-6", name: "MB Essentials", slug: "mb-essentials", status: "archived", homepageVisible: false, themeColor: "#64748B", displayOrder: 6 },
  { id: "bu-7", name: "MB Select", slug: "mb-select", status: "active", homepageVisible: false, themeColor: "#7C3AED", displayOrder: 7 },
  { id: "bu-8", name: "MB Daily", slug: "mb-daily", status: "active", homepageVisible: true, themeColor: "#DB2777", displayOrder: 8 },
  { id: "bu-9", name: "MB Pantry", slug: "mb-pantry", status: "inactive", homepageVisible: false, themeColor: "#B45309", displayOrder: 9 },
  { id: "bu-10", name: "MB Harvest", slug: "mb-harvest", status: "active", homepageVisible: true, themeColor: "#65A30D", displayOrder: 10 },
  { id: "bu-11", name: "MB Home", slug: "mb-home", status: "active", homepageVisible: false, themeColor: "#0369A1", displayOrder: 11 },
  { id: "bu-12", name: "MB Local", slug: "mb-local", status: "inactive", homepageVisible: false, themeColor: "#C2410C", displayOrder: 12 },
];
