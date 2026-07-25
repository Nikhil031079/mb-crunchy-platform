// ============================================================================
// Core Entity Types (v1.2)
// ============================================================================

export type EntityStatus = "active" | "inactive" | "archived";

export type Currency = "USD" | "EUR" | "GBP" | "NGN";

export interface Timestamps {
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Business Unit
// ============================================================================

export interface BusinessUnit extends Timestamps {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  logo?: string;
  banner?: string;
  coverImage?: string;
  icon?: string;
  description?: string;
  themeColor: string;
  secondaryColor?: string;
  homepageVisible: boolean;
  displayOrder: number;
  status: EntityStatus;
  enableCombos: boolean;
  enablePartyPacks: boolean;
  enableOffers: boolean;
  enableSearch: boolean;
  enableCheckout: boolean;
  enableDelivery: boolean;
  enablePickup: boolean;
  deletedAt?: number;
}

export type CreateBusinessUnitInput = Omit<
  BusinessUnit,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateBusinessUnitInput = Partial<CreateBusinessUnitInput>;

// ============================================================================
// Category
// ============================================================================

export interface Category extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  coverImage?: string;
  thumbnail?: string;
  displayOrder: number;
  status: EntityStatus;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  deletedAt?: number;
}

export type CreateCategoryInput = Omit<
  Category,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

// ============================================================================
// Product Variant (catalog-only — stock moved to inventory)
// ============================================================================

export interface ProductVariant {
  name: string;
  price: number;
  compareAtPrice?: number;
}

// ============================================================================
// Product (Catalog only)
// ============================================================================

export interface Product extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  coverImage?: string;
  thumbnail?: string;
  variants: ProductVariant[];
  tags: string[];
  status: EntityStatus;
  featured: boolean;
  displayOrder: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  deletedAt?: number;
}

export type CreateProductInput = Omit<
  Product,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateProductInput = Partial<CreateProductInput>;

// ============================================================================
// Catalog Item
// ============================================================================

export type CatalogItemType = "product" | "combo" | "partyPack";

export interface CatalogItem extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  itemType: CatalogItemType;
  sourceId: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  coverImage?: string;
  thumbnail?: string;
  tags: string[];
  status: EntityStatus;
  featured: boolean;
  displayOrder: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  deletedAt?: number;
}

// ============================================================================
// Inventory (Separate from Catalog)
// ============================================================================

export interface InventoryItem extends Timestamps {
  _id: string;
  _creationTime: number;
  catalogItemId: string;
  businessUnitId: string;
  variantName: string;
  sku?: string;
  stockQuantity: number;
  reservedStock?: number;
  available: boolean;
  lowStockAlert?: number;
  costPrice?: number;
  supplier?: string;
  barcode?: string;
  lastRestocked?: number;
  expiryDate?: number;
  location?: string;
  deletedAt?: number;
}

export type CreateInventoryInput = Omit<
  InventoryItem,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateInventoryInput = Partial<CreateInventoryInput>;

// ============================================================================
// Stock Movements (Audit trail)
// ============================================================================

export interface StockMovement {
  _id: string;
  _creationTime: number;
  inventoryId: string;
  businessUnitId: string;
  type: "adjustment" | "reservation" | "reservation_release" | "deduction" | "restoration" | "restock";
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  orderId?: string;
  performedBy?: string;
  createdAt: number;
}

// ============================================================================
// Inventory Dashboard Summary
// ============================================================================

export interface InventorySummary {
  totalItems: number;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
}

// ============================================================================
// Inventory Admin (enriched record for table display)
// ============================================================================

export interface InventoryRecord {
  id: string;
  catalogItemId: string;
  businessUnitId: string;
  businessUnitName: string;
  itemName: string;
  variantName: string;
  sku?: string;
  barcode?: string;
  stockQuantity: number;
  reservedStock: number;
  availableStock: number;
  lowStockAlert?: number;
  costPrice?: number;
  supplier?: string;
  location?: string;
  lastRestocked?: number;
  expiryDate?: number;
  available: boolean;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

// ============================================================================
// Combo
// ============================================================================

export interface ComboItem {
  catalogItemId: string;
  quantity: number;
}

export interface Combo extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  coverImage?: string;
  thumbnail?: string;
  items: ComboItem[];
  price: number;
  compareAtPrice?: number;
  savingsPercentage?: number;
  status: EntityStatus;
  featured: boolean;
  displayOrder: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  deletedAt?: number;
}

export type CreateComboInput = Omit<
  Combo,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateComboInput = Partial<CreateComboInput>;

// ============================================================================
// Party Pack
// ============================================================================

export interface PartyPackItem {
  catalogItemId: string;
  quantity: number;
}

export interface PartyPack extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  coverImage?: string;
  thumbnail?: string;
  items: PartyPackItem[];
  minServings: number;
  maxServings: number;
  price: number;
  compareAtPrice?: number;
  status: EntityStatus;
  featured: boolean;
  displayOrder: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  deletedAt?: number;
}

export type CreatePartyPackInput = Omit<
  PartyPack,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdatePartyPackInput = Partial<CreatePartyPackInput>;

// ============================================================================
// Offer
// ============================================================================

export interface Offer extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  title: string;
  description?: string;
  code?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  startsAt: number;
  endsAt: number;
  applicableCatalogItemIds: string[];
  applicableCategoryIds: string[];
  usageLimit?: number;
  usedCount: number;
  displayOrder: number;
  status: EntityStatus;
  banner?: string;
  deletedAt?: number;
}

export type CreateOfferInput = Omit<
  Offer,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "usedCount" | "deletedAt"
>;

export type UpdateOfferInput = Partial<CreateOfferInput>;

// ============================================================================
// Order
// ============================================================================

export interface OrderItem {
  catalogItemId: string;
  itemType: CatalogItemType;
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  image?: string;
}

export type OrderStatus =
  | "pending" | "confirmed" | "preparing" | "ready"
  | "out_for_delivery" | "delivered" | "cancelled" | "refunded";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type OrderType = "delivery" | "pickup";

export interface Order extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  orderType: OrderType;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  deliveryNotes?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  offerId?: string;
  offerCode?: string;
  deletedAt?: number;
}

export type CreateOrderInput = Omit<
  Order,
  "_id" | "_creationTime" | "createdAt" | "orderNumber" | "updatedAt" | "deletedAt"
>;

// ============================================================================
// Customer
// ============================================================================

export interface Customer extends Timestamps {
  _id: string;
  _creationTime: number;
  authUserId?: string;
  name: string;
  email?: string;
  phone?: string;
  totalOrders: number;
  totalSpent: number;
  notes?: string;
  status: EntityStatus;
  deletedAt?: number;
}

export type CreateCustomerInput = Omit<
  Customer,
  "_id" | "_creationTime" | "createdAt" | "totalOrders" | "totalSpent" | "updatedAt" | "deletedAt"
>;

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

// ============================================================================
// Customer Address
// ============================================================================

export interface CustomerAddress extends Timestamps {
  _id: string;
  _creationTime: number;
  customerId: string;
  label: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isDefault: boolean;
  latitude?: number;
  longitude?: number;
  deletedAt?: number;
}

export type CreateAddressInput = Omit<
  CustomerAddress,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

// ============================================================================
// Delivery Zone
// ============================================================================

export interface DeliveryZone extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  name: string;
  radius: number;
  charge: number;
  minOrder?: number;
  freeDeliveryThreshold?: number;
  estimatedMinutes?: number;
  status: "active" | "inactive";
  deletedAt?: number;
}

export type CreateDeliveryZoneInput = Omit<
  DeliveryZone,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateDeliveryZoneInput = Partial<CreateDeliveryZoneInput>;

// ============================================================================
// Content (Generic — replaces banners)
// ============================================================================

export type ContentType =
  | "hero" | "promotion" | "offer" | "homepageCard"
  | "announcement" | "popup" | "seasonal";

export interface Content extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId?: string;
  contentType: ContentType;
  title: string;
  subtitle?: string;
  body?: string;
  images: string[];
  coverImage?: string;
  thumbnail?: string;
  buttonText?: string;
  buttonLink?: string;
  displayOrder: number;
  status: EntityStatus;
  startDate?: number;
  endDate?: number;
  deletedAt?: number;
}

export type CreateContentInput = Omit<
  Content,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateContentInput = Partial<CreateContentInput>;

// ============================================================================
// Homepage Section (Layout Builder)
// ============================================================================

export type SectionType =
  | "hero" | "businessUnits" | "featuredProducts" | "combos"
  | "partyPacks" | "offers" | "content" | "testimonials" | "footer";

export interface HomepageSection extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  sectionType: SectionType;
  title?: string;
  displayOrder: number;
  visible: boolean;
  settings?: Record<string, unknown>;
  deletedAt?: number;
}

export type CreateHomepageSectionInput = Omit<
  HomepageSection,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateHomepageSectionInput = Partial<CreateHomepageSectionInput>;

// ============================================================================
// Notification Channel
// ============================================================================

export type NotificationChannel = "whatsapp" | "sms" | "email" | "push";

export interface NotificationChannelConfig extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  channel: NotificationChannel;
  enabled: boolean;
  config?: Record<string, unknown>;
  deletedAt?: number;
}

export type CreateNotificationInput = Omit<
  NotificationChannelConfig,
  "_id" | "_creationTime" | "createdAt" | "updatedAt" | "deletedAt"
>;

// ============================================================================
// Analytics — Daily Metrics
// ============================================================================

export interface DailyMetric extends Timestamps {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  topProducts?: Record<string, unknown>;
  topCombos?: Record<string, unknown>;
  popularCategories?: Record<string, unknown>;
  mostSearched?: Record<string, unknown>;
}

export interface AnalyticsEvent {
  _id: string;
  _creationTime: number;
  businessUnitId: string;
  eventType: "view" | "search" | "add_to_cart" | "purchase" | "share";
  catalogItemId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Settings
// ============================================================================

export interface BusinessUnitSettings extends Timestamps {
  businessUnitId: string;
  currency: Currency;
  taxRate: number;
  deliveryFee: number;
  freeDeliveryThreshold?: number;
  openingHours?: Record<string, { open: string; close: string }>;
  isOpen: boolean;
  phone?: string;
  email?: string;
  address?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  deletedAt?: number;
}

export interface GlobalSettings extends Timestamps {
  siteName: string;
  siteDescription?: string;
  logo?: string;
  favicon?: string;
  primaryColor: string;
  supportEmail?: string;
  supportPhone?: string;
  deletedAt?: number;
}

// ============================================================================
// Cart
// ============================================================================

export interface CartItem {
  catalogItemId: string;
  itemType: CatalogItemType;
  businessUnitId: string;
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  image?: string;
}

export interface CartState {
  items: CartItem[];
  businessUnitId: string | null;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  note?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  cursor?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Navigation
// ============================================================================

export interface NavLink {
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  children?: NavLink[];
}

// ============================================================================
// Homepage Layout Type (for building dynamic homepages)
// ============================================================================

export interface HomepageLayout {
  sections: HomepageSection[];
  content: Content[];
  businessUnits: BusinessUnit[];
  catalogItems: CatalogItem[];
}
