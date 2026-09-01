// ============================================================================
// MB CRUNCHY - Global Constants
// ============================================================================

export const SITE_NAME = "MB CRUNCHY";

export const SITE_DESCRIPTION = "Your premium destination for quality products and services";

// ============================================================================
// Routing
// ============================================================================

export const ROUTES = {
  HOME: "/",
  SEARCH: "/search",
  AUTH: "/auth",
  CART: "/cart",
  CHECKOUT: "/checkout",
  TRACK_ORDER: "/track-order",
  ADMIN: {
    ROOT: "/admin",
    DASHBOARD: "/admin/dashboard",
    BUSINESS_UNITS: "/admin/business-units",
    CATEGORIES: "/admin/categories",
    PRODUCTS: "/admin/products",
    COMBOS: "/admin/combos",
    PARTY_PACKS: "/admin/party-packs",
    OFFERS: "/admin/offers",
    ORDERS: "/admin/orders",
    REPORTS: "/admin/reports",
    INVENTORY: "/admin/inventory",
    CUSTOMERS: "/admin/customers",
    SETTINGS: "/admin/settings",
    DELIVERY_ZONES: "/admin/delivery-zones",
    BANNERS: "/admin/banners",
    HOMEPAGE_SECTIONS: "/admin/homepage-sections",
    FLASH_SALES: "/admin/flash-sales",
    HAPPY_HOUR: "/admin/happy-hour",
    MEAL_DEALS: "/admin/meal-deals",
    LOGIN: "/admin/login",
    SETUP: "/admin/setup",
    FORGOT_PASSWORD: "/admin/forgot-password",
  },
  KITCHEN: {
    ROOT: "/kitchen",
    DASHBOARD: "/kitchen/dashboard",
    LOGIN: "/kitchen/login",
  },
  ACCOUNT: {
    ROOT: "/account",
    PROFILE: "/account/profile",
    ORDERS: "/account/orders",
    ADDRESSES: "/account/addresses",
    FAVOURITES: "/account/favourites",
    LOYALTY: "/account/loyalty",
  },
} as const;

// ============================================================================
// Business Unit Links (built from slug pattern)
// ============================================================================

export const BUSINESS_UNIT_ROUTE = (slug: string) => `/${slug}`;
export const CATEGORY_ROUTE = (buSlug: string, catSlug: string) =>
  `/${buSlug}/${catSlug}`;
export const PRODUCT_ROUTE = (
  buSlug: string,
  catSlug: string,
  productSlug: string
) => `/${buSlug}/${catSlug}/${productSlug}`;

// ============================================================================
// Admin Navigation
// ============================================================================

export type AdminNavigationIcon =
  | "LayoutDashboard"
  | "Building2"
  | "FolderTree"
  | "Package"
  | "Combine"
  | "PartyPopper"
  | "Tag"
  | "ShoppingCart"
  | "Users"
  | "Image"
  | "Settings"
  | "Warehouse"
  | "LayoutTemplate"
  | "Zap"
  | "Clock3"
  | "BarChart3"
  | "Truck"
  | "UtensilsCrossed";

export interface AdminNavigationItem {
  label: string;
  href?: string;
  icon: AdminNavigationIcon;
  children?: AdminNavigationItem[];
}

export const ADMIN_NAVIGATION: AdminNavigationItem[] = [
  {
    label: "Overview",
    icon: "LayoutDashboard",
    children: [
      { label: "Dashboard", href: ROUTES.ADMIN.DASHBOARD, icon: "LayoutDashboard" },
    ],
  },
  {
    label: "Catalog",
    icon: "Package",
    children: [
      { label: "Business Units", href: ROUTES.ADMIN.BUSINESS_UNITS, icon: "Building2" },
      { label: "Categories", href: ROUTES.ADMIN.CATEGORIES, icon: "FolderTree" },
      { label: "Products", href: ROUTES.ADMIN.PRODUCTS, icon: "Package" },
      { label: "Combos", href: ROUTES.ADMIN.COMBOS, icon: "Combine" },
      { label: "Party Packs", href: ROUTES.ADMIN.PARTY_PACKS, icon: "PartyPopper" },
      { label: "Meal Deals", href: ROUTES.ADMIN.MEAL_DEALS, icon: "UtensilsCrossed" },
      { label: "Inventory", href: ROUTES.ADMIN.INVENTORY, icon: "Warehouse" },
    ],
  },
  {
    label: "Sales",
    icon: "ShoppingCart",
    children: [
      { label: "Offers", href: ROUTES.ADMIN.OFFERS, icon: "Tag" },
      { label: "Orders", href: ROUTES.ADMIN.ORDERS, icon: "ShoppingCart" },
      { label: "Delivery Zones", href: ROUTES.ADMIN.DELIVERY_ZONES, icon: "Truck" },
      { label: "Reports", href: ROUTES.ADMIN.REPORTS, icon: "BarChart3" },
      { label: "Customers", href: ROUTES.ADMIN.CUSTOMERS, icon: "Users" },
    ],
  },
  {
    label: "Experience",
    icon: "Image",
    children: [
      { label: "Homepage Sections", href: ROUTES.ADMIN.HOMEPAGE_SECTIONS, icon: "LayoutTemplate" },
      { label: "Banners", href: ROUTES.ADMIN.BANNERS, icon: "Image" },
      { label: "Flash Sales", href: ROUTES.ADMIN.FLASH_SALES, icon: "Zap" },
      { label: "Happy Hour", href: ROUTES.ADMIN.HAPPY_HOUR, icon: "Clock3" },
      { label: "Settings", href: ROUTES.ADMIN.SETTINGS, icon: "Settings" },
    ],
  },
];

export interface AdminRouteContext {
  title: string;
  group?: string;
}

export function getAdminRouteContext(pathname: string): AdminRouteContext {
  for (const group of ADMIN_NAVIGATION) {
    for (const item of group.children ?? []) {
      if (item.href === pathname) {
        return { title: item.label, group: group.label };
      }
    }
  }

  return { title: "Administration" };
}

// ============================================================================
// Status Options
// ============================================================================

export const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
] as const;

// ============================================================================
// Order Status Options
// ============================================================================

export const ORDER_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Out for Delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
] as const;

// ============================================================================
// Payment Status Options
// ============================================================================

export const PAYMENT_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
] as const;

// ============================================================================
// Discount Types
// ============================================================================

export const DISCOUNT_TYPES = [
  { label: "Percentage (%)", value: "percentage" },
  { label: "Fixed Amount", value: "fixed" },
] as const;

// ============================================================================
// Order Types
// ============================================================================

export const ORDER_TYPES = [
  { label: "Delivery", value: "delivery" },
  { label: "Pickup", value: "pickup" },
] as const;

// ============================================================================
// Pagination
// ============================================================================

export const DEFAULT_PAGE_SIZE = 12;
export const ADMIN_PAGE_SIZE = 20;

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  CART: "mb-crunchy-cart",
  THEME: "mb-crunchy-theme",
  SETTINGS: "mb-crunchy-settings",
  RECENTLY_VIEWED: "mb-crunchy-recently-viewed",
  BROWSING_PREFERENCE: "mb-crunchy-browsing-preference",
  LOCATION: "mb-crunchy-location-v1",
} as const;

// ============================================================================
// Business Unit Defaults
// ============================================================================

export const DEFAULT_THEME_COLOR = "#000000";

// ============================================================================
// Empty States
// ============================================================================

export const EMPTY_MESSAGES = {
  BUSINESS_UNITS: "No business units found. Create your first one to get started.",
  CATEGORIES: "No categories yet. Add categories to organize your products.",
  PRODUCTS: "No products available. Start adding products to your catalog.",
  COMBOS: "No combos created yet. Combine products into great deals.",
  PARTY_PACKS: "No party packs configured. Create packs for events.",
  OFFERS: "No active offers. Create promotions to boost sales.",
  MEAL_DEALS: "No meal deals configured. Create deals to bundle products at a discount.",
  ORDERS: "No orders received yet. Orders will appear here.",
  INVENTORY: "No inventory items yet. Add stock for your catalog items.",
  CUSTOMERS: "No customers registered yet.",
  BANNERS: "No banners created. Add banners for promotions.",
  CART: "Your cart is empty. Browse our business units to add items.",
} as const;

// ============================================================================
// Colors
// ============================================================================

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-amber-500/10 text-amber-600 border-amber-200",
  archived: "bg-gray-500/10 text-gray-600 border-gray-200",
  pending: "bg-blue-500/10 text-blue-600 border-blue-200",
  confirmed: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  preparing: "bg-amber-500/10 text-amber-600 border-amber-200",
  ready: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  out_for_delivery: "bg-purple-500/10 text-purple-600 border-purple-200",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  cancelled: "bg-red-500/10 text-red-600 border-red-200",
  refunded: "bg-gray-500/10 text-gray-600 border-gray-200",
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  failed: "bg-red-500/10 text-red-600 border-red-200",
};
