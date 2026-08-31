// ============================================================================
// MB CRUNCHY - Convex Database Schema (v1.2 + Auth)
// Unified schema: auth tables + all business tables
// ============================================================================

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// AUTH TABLES (from @convex-dev/auth)
// ============================================================================

// Auth tables are spread in the defineSchema call below

// ============================================================================
// BUSINESS UNITS
// ============================================================================

const businessUnits = defineTable({
  name: v.string(),
  slug: v.string(),
  logo: v.optional(v.string()),
  banner: v.optional(v.string()),
  coverImage: v.optional(v.string()),
  icon: v.optional(v.string()),
  description: v.optional(v.string()),
  themeColor: v.string(),
  secondaryColor: v.optional(v.string()),
  homepageVisible: v.boolean(),
  displayOrder: v.number(),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  enableCombos: v.boolean(),
  enablePartyPacks: v.boolean(),
  enableOffers: v.boolean(),
  enableSearch: v.boolean(),
  enableCheckout: v.boolean(),
  enableDelivery: v.boolean(),
  enablePickup: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_slug", ["slug"])
  .index("by_status", ["status"])
  .index("by_homepage_visible", ["homepageVisible", "displayOrder"]);

// ============================================================================
// CATEGORIES
// ============================================================================

const categories = defineTable({
  businessUnitId: v.id("businessUnits"),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  images: v.array(v.string()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  displayOrder: v.number(),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  metaKeywords: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_business_unit_slug", ["businessUnitId", "slug"])
  .index("by_status", ["status"]);

// ============================================================================
// PRODUCTS (Catalog only — stock moved to inventory)
// ============================================================================

const productVariants = v.object({
  optionName: v.string(),
  optionValue: v.string(),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  sku: v.optional(v.string()),
  barcode: v.optional(v.string()),
  stock: v.optional(v.number()),
  costPrice: v.optional(v.number()),
  taxPercentage: v.optional(v.number()),
  image: v.optional(v.string()),
  minOrderQty: v.optional(v.number()),
  isDefault: v.boolean(),
  sortOrder: v.number(),
  active: v.boolean(),
});

const products = defineTable({
  businessUnitId: v.id("businessUnits"),
  categoryId: v.id("categories"),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  images: v.array(v.string()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  variants: v.array(productVariants),
  tags: v.array(v.string()),
  sku: v.optional(v.string()),
  stockQuantity: v.optional(v.number()),
  unit: v.optional(v.union(v.literal("pcs"), v.literal("kg"), v.literal("litre"), v.literal("pack"), v.literal("dozen"), v.literal("box"))),
  vegNonVeg: v.optional(v.union(v.literal("veg"), v.literal("non-veg"))),
  taxPercentage: v.optional(v.number()),
  available: v.boolean(),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  metaKeywords: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  featured: v.boolean(),
  displayOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_category", ["categoryId", "displayOrder"])
  .index("by_slug_in_business_unit", ["businessUnitId", "slug"])
  .index("by_status", ["status"])
  .index("by_featured", ["businessUnitId", "featured"])
  .index("by_tags", ["tags"]);

// ============================================================================
// COMBOS
// ============================================================================

const comboItems = v.object({
  catalogItemId: v.id("catalogItems"),
  quantity: v.number(),
});

const combos = defineTable({
  businessUnitId: v.id("businessUnits"),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  images: v.array(v.string()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  items: v.array(comboItems),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  savingsPercentage: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  featured: v.boolean(),
  displayOrder: v.number(),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  metaKeywords: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  settings: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_slug_in_business_unit", ["businessUnitId", "slug"])
  .index("by_status", ["status"])
  .index("by_featured", ["businessUnitId", "featured"]);

// ============================================================================
// PARTY PACKS
// ============================================================================

const partyPackItems = v.object({
  catalogItemId: v.id("catalogItems"),
  quantity: v.number(),
});

const partyPacks = defineTable({
  businessUnitId: v.id("businessUnits"),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  images: v.array(v.string()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  items: v.array(partyPackItems),
  minServings: v.number(),
  maxServings: v.number(),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  featured: v.boolean(),
  displayOrder: v.number(),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  metaKeywords: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_slug_in_business_unit", ["businessUnitId", "slug"])
  .index("by_status", ["status"])
  .index("by_featured", ["businessUnitId", "featured"]);

// ============================================================================
// CATALOG ITEMS (Unified index)
// ============================================================================

const catalogItems = defineTable({
  businessUnitId: v.id("businessUnits"),
  itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
  sourceId: v.string(),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  tags: v.array(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  featured: v.boolean(),
  displayOrder: v.number(),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  metaKeywords: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_slug_in_business_unit", ["businessUnitId", "slug"])
  .index("by_source", ["sourceId"])
  .index("by_item_type", ["itemType"])
  .index("by_status", ["status"])
  .index("by_featured", ["businessUnitId", "featured"])
  .index("by_tags", ["tags"]);

// ============================================================================
// INVENTORY (Separate from Catalog)
// ============================================================================

const inventory = defineTable({
  catalogItemId: v.id("catalogItems"),
  businessUnitId: v.id("businessUnits"),
  variantName: v.string(),
  sku: v.optional(v.string()),
  stockQuantity: v.number(),
  reservedStock: v.number(),
  available: v.boolean(),
  lowStockAlert: v.optional(v.number()),
  costPrice: v.optional(v.number()),
  supplier: v.optional(v.string()),
  barcode: v.optional(v.string()),
  lastRestocked: v.optional(v.number()),
  expiryDate: v.optional(v.number()),
  location: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_catalog_item", ["catalogItemId"])
  .index("by_business_unit", ["businessUnitId"])
  .index("by_sku", ["sku"])
  .index("by_available", ["available"])
  .index("by_barcode", ["barcode"]);

// ============================================================================
// STOCK MOVEMENTS (Audit trail for all inventory changes)
// ============================================================================

const stockMovements = defineTable({
  inventoryId: v.id("inventory"),
  businessUnitId: v.id("businessUnits"),
  type: v.union(
    v.literal("adjustment"),
    v.literal("reservation"),
    v.literal("reservation_release"),
    v.literal("deduction"),
    v.literal("restoration"),
    v.literal("restock"),
  ),
  quantity: v.number(),
  previousStock: v.number(),
  newStock: v.number(),
  reason: v.optional(v.string()),
  orderId: v.optional(v.id("orders")),
  performedBy: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_inventory", ["inventoryId"])
  .index("by_business_unit", ["businessUnitId", "createdAt"])
  .index("by_order", ["orderId"])
  .index("by_type", ["type"]);

// ============================================================================
// OFFERS
// ============================================================================

const offers = defineTable({
  businessUnitId: v.id("businessUnits"),
  title: v.string(),
  description: v.optional(v.string()),
  code: v.optional(v.string()),
  discountType: v.union(v.literal("percentage"), v.literal("fixed")),
  discountValue: v.number(),
  minOrderValue: v.optional(v.number()),
  maxDiscount: v.optional(v.number()),
  startsAt: v.number(),
  endsAt: v.number(),
  applicableCatalogItemIds: v.array(v.id("catalogItems")),
  applicableCategoryIds: v.array(v.id("categories")),
  usageLimit: v.optional(v.number()),
  usedCount: v.number(),
  displayOrder: v.number(),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  banner: v.optional(v.string()),
  settings: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_code", ["code"])
  .index("by_status", ["status"])
  .index("by_active_period", ["startsAt", "endsAt"]);

// ============================================================================
// MEAL DEALS (Configurable promotional bundles)
// ============================================================================

const mealDealQualifyingItem = v.object({
  catalogItemId: v.id("catalogItems"),
  quantity: v.number(),
  alternatives: v.optional(v.array(v.id("catalogItems"))),
});

const mealDeals = defineTable({
  businessUnitId: v.id("businessUnits"),
  name: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  dealPrice: v.number(),
  qualifyingItems: v.array(mealDealQualifyingItem),
  applyToCombos: v.boolean(),
  applyToPartyPacks: v.boolean(),
  parentCatalogItemIds: v.optional(v.array(v.id("catalogItems"))),
  cartSmartDetection: v.boolean(),
  displayOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_status", ["status"]);

// ============================================================================
// DELIVERY POLICIES (Global — not BU-owned)
// ============================================================================

const deliveryPolicies = defineTable({
  name: v.string(),
  scope: v.union(v.literal("global")),
  serviceType: v.union(v.literal("local"), v.literal("manual")),
  status: v.union(v.literal("active"), v.literal("inactive")),
  feeType: v.union(v.literal("fixed"), v.literal("quote")),
  fixedFee: v.optional(v.number()),
  minimumOrder: v.optional(v.number()),
  freeDeliveryThreshold: v.optional(v.number()),
  estimatedMinutes: v.optional(v.number()),
  radius: v.optional(v.number()),
  requiresQuote: v.boolean(),
  instructions: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

// ============================================================================
// ORDERS
// ============================================================================

const orderItems = v.object({
  catalogItemId: v.id("catalogItems"),
  itemType: v.union(v.literal("product"), v.literal("combo"), v.literal("partyPack")),
  name: v.string(),
  variantName: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  totalPrice: v.number(),
  image: v.optional(v.string()),
});

const orders = defineTable({
  businessUnitId: v.id("businessUnits"),
  orderNumber: v.string(),
  customerId: v.optional(v.id("customers")),
  customerName: v.string(),
  customerPhone: v.string(),
  customerEmail: v.optional(v.string()),
  items: v.array(orderItems),
  subtotal: v.number(),
  discount: v.number(),
  deliveryFee: v.number(),
  tax: v.number(),
  total: v.number(),
  orderType: v.union(v.literal("delivery"), v.literal("pickup")),
  deliveryType: v.optional(v.union(v.literal("local"), v.literal("outside_area"))),
  deliveryAddress: v.optional(v.string()),
  deliveryZoneId: v.optional(v.id("deliveryZones")),
  deliveryNotes: v.optional(v.string()),
  deliveryQuoteRequired: v.optional(v.boolean()),
  deliveryQuoteStatus: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("quoted"),
      v.literal("accepted"),
      v.literal("rejected")
    )
  ),
  deliveryQuoteAmount: v.optional(v.number()),
  deliveryQuoteNotes: v.optional(v.string()),
  deliveryQuoteUpdatedAt: v.optional(v.number()),
  status: v.union(
    v.literal("awaiting_payment"), v.literal("pending"), v.literal("confirmed"), v.literal("preparing"),
    v.literal("ready"), v.literal("out_for_delivery"), v.literal("delivered"),
    v.literal("cancelled"), v.literal("refunded")
  ),
  paymentStatus: v.union(
    v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("refunded")
  ),
  paymentMethod: v.optional(v.string()),
  paymentReference: v.optional(v.string()),
  razorpayOrderId: v.optional(v.string()),
  razorpayPaymentId: v.optional(v.string()),
  razorpaySignature: v.optional(v.string()),
  offerId: v.optional(v.id("offers")),
  offerCode: v.optional(v.string()),
  loyaltyPointsToRedeem: v.optional(v.number()),
  idempotencyKey: v.optional(v.string()),
  terminalAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId"])
  .index("by_order_number", ["orderNumber"])
  .index("by_customer", ["customerId"])
  .index("by_status", ["status"])
  .index("by_phone", ["customerPhone"])
  .index("by_idempotency_key", ["idempotencyKey"])
  .index("by_razorpayOrderId", ["razorpayOrderId"])
  .index("by_razorpayPaymentId", ["razorpayPaymentId"]);

// ============================================================================
// ORDER ACTIVITIES (Audit timeline for the order lifecycle)
// ============================================================================

const orderActivities = defineTable({
  orderId: v.id("orders"),
  businessUnitId: v.id("businessUnits"),
  action: v.union(
    v.literal("order_created"),
    v.literal("payment_pending"),
    v.literal("payment_verified"),
    v.literal("payment_failed"),
    v.literal("order_accepted"),
    v.literal("preparing"),
    v.literal("ready"),
    v.literal("out_for_delivery"),
    v.literal("delivered"),
    v.literal("cancelled"),
    v.literal("refund_initiated"),
    v.literal("refund_completed"),
    v.literal("manual_status_change"),
    v.literal("inventory_reserved"),
    v.literal("inventory_released"),
    v.literal("note_added"),
    v.literal("note_updated"),
    v.literal("note_deleted"),
  ),
  previousValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  actor: v.string(),
  actorId: v.optional(v.string()),
  visibleToCustomer: v.boolean(),
  createdAt: v.number(),
})
  .index("by_order", ["orderId", "createdAt"])
  .index("by_business_unit", ["businessUnitId", "createdAt"]);

// ============================================================================
// ORDER NOTES (Internal, admin-only)
// ============================================================================

const orderNotes = defineTable({
  orderId: v.id("orders"),
  businessUnitId: v.id("businessUnits"),
  author: v.string(),
  authorId: v.optional(v.string()),
  note: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_order", ["orderId", "createdAt"]);

// ============================================================================
// CUSTOMERS
// ============================================================================

const customers = defineTable({
  authUserId: v.optional(v.string()),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  totalOrders: v.number(),
  totalSpent: v.number(),
  lastOrderAt: v.optional(v.number()),
  notes: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_auth_user", ["authUserId"])
  .index("by_email", ["email"])
  .index("by_phone", ["phone"])
  .index("by_status", ["status"]);

// ============================================================================
// CUSTOMER ADDRESSES (Separate collection)
// ============================================================================

const addresses = defineTable({
  customerId: v.id("customers"),
  label: v.string(),
  address: v.string(),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zipCode: v.optional(v.string()),
  landmark: v.optional(v.string()),
  deliveryInstructions: v.optional(v.string()),
  deliveryZone: v.optional(v.string()),
  isDefault: v.boolean(),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_customer", ["customerId"])
  .index("by_default", ["customerId", "isDefault"]);

// ============================================================================
// LOYALTY SETTINGS (Single record — configurable loyalty program)
// ============================================================================

const loyaltySettings = defineTable({
  pointsPerRupee: v.number(),
  rupeesPerPointRedemption: v.number(),
  minRedeemPoints: v.number(),
  maxRedeemPercentOfOrder: v.number(),
  tierThresholds: v.object({
    silver: v.number(),
    gold: v.number(),
    platinum: v.number(),
  }),
  tierMultipliers: v.object({
    bronze: v.number(),
    silver: v.number(),
    gold: v.number(),
    platinum: v.number(),
  }),
  pointsExpiryDays: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// ============================================================================
// LOYALTY ACCOUNTS (Per-customer loyalty state)
// ============================================================================

const loyaltyAccounts = defineTable({
  customerId: v.id("customers"),
  pointsBalance: v.number(),
  totalEarned: v.number(),
  totalRedeemed: v.number(),
  tier: v.union(
    v.literal("bronze"),
    v.literal("silver"),
    v.literal("gold"),
    v.literal("platinum"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_customer", ["customerId"]);

// ============================================================================
// LOYALTY TRANSACTIONS (Immutable ledger)
// ============================================================================

const loyaltyTransactions = defineTable({
  customerId: v.id("customers"),
  orderId: v.optional(v.id("orders")),
  type: v.union(
    v.literal("earned"),
    v.literal("redeemed"),
    v.literal("expired"),
    v.literal("adjusted"),
  ),
  points: v.number(),
  description: v.string(),
  balanceAfter: v.number(),
  createdAt: v.number(),
})
  .index("by_customer", ["customerId"])
  .index("by_order", ["orderId"]);

// ============================================================================
// CUSTOMER COLLECTIONS (Generic — favorites, wishlist, recently viewed, etc.)
// ============================================================================

const customerCollections = defineTable({
  customerId: v.id("customers"),
  collectionType: v.union(
    v.literal("favorites"),
    v.literal("wishlist"),
    v.literal("recentlyViewed"),
    v.literal("savedForLater"),
  ),
  itemType: v.union(
    v.literal("product"),
    v.literal("combo"),
    v.literal("partyPack"),
  ),
  itemId: v.id("catalogItems"),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_customer_item", ["customerId", "collectionType", "itemType", "itemId"])
  .index("by_customer_type", ["customerId", "collectionType"]);

// ============================================================================
// DELIVERY ZONES
// ============================================================================

const deliveryZones = defineTable({
  businessUnitId: v.id("businessUnits"),
  name: v.string(),
  radius: v.number(),
  charge: v.number(),
  minOrder: v.optional(v.number()),
  freeDeliveryThreshold: v.optional(v.number()),
  estimatedMinutes: v.optional(v.number()),
  isDefault: v.optional(v.boolean()),
  status: v.union(v.literal("active"), v.literal("inactive")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId"])
  .index("by_is_default", ["isDefault"]);

// ============================================================================
// CONTENT (Generic — replaces banners with hero, promo, announcement, etc.)
// ============================================================================

const content = defineTable({
  businessUnitId: v.optional(v.id("businessUnits")),
  contentType: v.union(
    v.literal("hero"),
    v.literal("promotion"),
    v.literal("offer"),
    v.literal("homepageCard"),
    v.literal("announcement"),
    v.literal("popup"),
    v.literal("seasonal")
  ),
  title: v.string(),
  subtitle: v.optional(v.string()),
  body: v.optional(v.string()),
  images: v.array(v.string()),
  coverImage: v.optional(v.string()),
  thumbnail: v.optional(v.string()),
  buttonText: v.optional(v.string()),
  buttonLink: v.optional(v.string()),
  displayOrder: v.number(),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  settings: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_content_type", ["contentType"])
  .index("by_status", ["status"])
  .index("by_active_range", ["status", "startDate", "endDate"]);

// ============================================================================
// HOMEPAGE SECTIONS (Layout builder)
// ============================================================================

const homepageSections = defineTable({
  businessUnitId: v.id("businessUnits"),
  sectionType: v.union(
    v.literal("hero"),
    v.literal("businessUnits"),
    v.literal("featuredProducts"),
    v.literal("combos"),
    v.literal("partyPacks"),
    v.literal("offers"),
    v.literal("content"),
    v.literal("testimonials"),
    v.literal("footer")
  ),
  title: v.optional(v.string()),
  displayOrder: v.number(),
  visible: v.boolean(),
  settings: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId", "displayOrder"])
  .index("by_visible", ["businessUnitId", "visible"]);

// ============================================================================
// NOTIFICATIONS (Separate module from Settings)
// ============================================================================

const notifications = defineTable({
  businessUnitId: v.id("businessUnits"),
  channel: v.union(
    v.literal("whatsapp"),
    v.literal("sms"),
    v.literal("email"),
    v.literal("push")
  ),
  enabled: v.boolean(),
  config: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId"])
  .index("by_channel", ["businessUnitId", "channel"]);

// ============================================================================
// ANALYTICS — Daily Metrics
// ============================================================================

const dailyMetrics = defineTable({
  businessUnitId: v.id("businessUnits"),
  date: v.string(),
  totalOrders: v.number(),
  totalRevenue: v.number(),
  averageOrderValue: v.number(),
  topProducts: v.optional(v.any()),
  topCombos: v.optional(v.any()),
  popularCategories: v.optional(v.any()),
  mostSearched: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_business_unit", ["businessUnitId", "date"])
  .index("by_date", ["date"]);

// ============================================================================
// Analytics — Event Log (for raw view/search data)
// ============================================================================

const analyticsEvents = defineTable({
  businessUnitId: v.id("businessUnits"),
  eventType: v.union(
    v.literal("view"),
    v.literal("search"),
    v.literal("add_to_cart"),
    v.literal("purchase"),
    v.literal("share")
  ),
  catalogItemId: v.optional(v.id("catalogItems")),
  sessionId: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_business_unit", ["businessUnitId", "createdAt"])
  .index("by_event_type", ["eventType"])
  .index("by_catalog_item", ["catalogItemId"]);

// ============================================================================
// SETTINGS (Simplified — WhatsApp moved to notifications)
// ============================================================================

const settings = defineTable({
  businessUnitId: v.id("businessUnits"),
  currency: v.string(),
  taxRate: v.number(),
  deliveryFee: v.number(),
  freeDeliveryThreshold: v.optional(v.number()),
  openingHours: v.optional(v.any()),
  isOpen: v.boolean(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  socialLinks: v.optional(
    v.object({
      instagram: v.optional(v.string()),
      facebook: v.optional(v.string()),
      twitter: v.optional(v.string()),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_business_unit", ["businessUnitId"]);

// ============================================================================
// GLOBAL SETTINGS
// ============================================================================

const globalSettings = defineTable({
  siteName: v.string(),
  siteDescription: v.optional(v.string()),
  logo: v.optional(v.string()),
  favicon: v.optional(v.string()),
  primaryColor: v.string(),
  supportEmail: v.optional(v.string()),
  supportPhone: v.optional(v.string()),
  paymentConfig: v.optional(
    v.object({
      mode: v.union(v.literal("upi_qr"), v.literal("razorpay")),
      upiId: v.optional(v.string()),
      merchantName: v.optional(v.string()),
      whatsappNumber: v.optional(v.string()),
      qrDisplayName: v.optional(v.string()),
      paymentInstructions: v.optional(v.string()),
    })
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

// ============================================================================
// ADMIN SESSIONS
// ============================================================================

const adminSessions = defineTable({
  adminId: v.id("admins"),
  token: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
})
  .index("by_token", ["token"])
  .index("by_admin", ["adminId"]);

// ============================================================================
// ADMINS
// ============================================================================

// ============================================================================
// REVIEWS
// ============================================================================

const reviews = defineTable({
  businessUnitId: v.id("businessUnits"),
  catalogItemId: v.id("catalogItems"),
  customerId: v.id("customers"),
  orderId: v.optional(v.id("orders")),
  rating: v.number(),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  images: v.array(v.string()),
  verifiedPurchase: v.boolean(),
  helpfulCount: v.number(),
  status: v.union(v.literal("active"), v.literal("hidden"), v.literal("flagged")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
  .index("by_catalog_item", ["catalogItemId", "createdAt"])
  .index("by_customer", ["customerId"])
  .index("by_business_unit", ["businessUnitId", "createdAt"])
  .index("by_order", ["orderId"]);

// ============================================================================
// IN-APP NOTIFICATIONS
// ============================================================================

const inAppNotifications = defineTable({
  userId: v.string(),
  title: v.string(),
  body: v.string(),
  type: v.union(
    v.literal("order_update"),
    v.literal("promotion"),
    v.literal("system"),
    v.literal("low_stock"),
  ),
  link: v.optional(v.string()),
  read: v.boolean(),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_user", ["userId", "createdAt"])
  .index("by_user_read", ["userId", "read"]);

// ============================================================================
// ADMINS
// ============================================================================

const admins = defineTable({
  username: v.string(),
  passwordHash: v.string(),
  passwordSalt: v.string(),
  role: v.union(v.literal("superadmin"), v.literal("admin"), v.literal("kitchen")),
  active: v.boolean(),
  recoveryKeyHash: v.optional(v.string()),
  recoveryKeySalt: v.optional(v.string()),
  businessUnitIds: v.optional(v.array(v.id("businessUnits"))),
  lastLoginAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_username", ["username"]);

// ============================================================================
// Export Schema (auth tables + business tables merged)
// ============================================================================

export default defineSchema({
  ...authTables,
  businessUnits,
  categories,
  products,
  combos,
  partyPacks,
  catalogItems,
  inventory,
  stockMovements,
  offers,
  mealDeals,
  orders,
  orderActivities,
  orderNotes,
  customers,
  addresses,
  loyaltySettings,
  loyaltyAccounts,
  loyaltyTransactions,
  customerCollections,
  deliveryZones,
  deliveryPolicies,
  content,
  homepageSections,
  notifications,
  dailyMetrics,
  analyticsEvents,
  settings,
  globalSettings,
  admins,
  adminSessions,
  reviews,
  inAppNotifications,
}, {
  schemaValidation: false,
});
