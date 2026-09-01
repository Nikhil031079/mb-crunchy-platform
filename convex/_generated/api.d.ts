/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addresses from "../addresses.js";
import type * as adminAuth from "../adminAuth.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as businessUnits from "../businessUnits.js";
import type * as catalogItems from "../catalogItems.js";
import type * as categories from "../categories.js";
import type * as collections from "../collections.js";
import type * as combos from "../combos.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as deliveryPolicies from "../deliveryPolicies.js";
import type * as deliveryZones from "../deliveryZones.js";
import type * as geocode from "../geocode.js";
import type * as homepageSections from "../homepageSections.js";
import type * as http from "../http.js";
import type * as inAppNotifications from "../inAppNotifications.js";
import type * as inventory from "../inventory.js";
import type * as loyalty from "../loyalty.js";
import type * as maintenance from "../maintenance.js";
import type * as mealDeals from "../mealDeals.js";
import type * as migrations_convertVariants from "../migrations/convertVariants.js";
import type * as notificationService from "../notificationService.js";
import type * as notifications from "../notifications.js";
import type * as offers from "../offers.js";
import type * as orderActivities from "../orderActivities.js";
import type * as orderBulk from "../orderBulk.js";
import type * as orderNotes from "../orderNotes.js";
import type * as orderWorkflow from "../orderWorkflow.js";
import type * as orders from "../orders.js";
import type * as partyPacks from "../partyPacks.js";
import type * as products from "../products.js";
import type * as razorpay from "../razorpay.js";
import type * as razorpayWebhook from "../razorpayWebhook.js";
import type * as reviews from "../reviews.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";
import type * as utils_adminAuth from "../utils/adminAuth.js";
import type * as utils_crypto from "../utils/crypto.js";
import type * as utils_customerAccess from "../utils/customerAccess.js";
import type * as utils_phone from "../utils/phone.js";
import type * as utils_storeHours from "../utils/storeHours.js";
import type * as utils_variantHelper from "../utils/variantHelper.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  adminAuth: typeof adminAuth;
  analytics: typeof analytics;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  businessUnits: typeof businessUnits;
  catalogItems: typeof catalogItems;
  categories: typeof categories;
  collections: typeof collections;
  combos: typeof combos;
  content: typeof content;
  crons: typeof crons;
  customers: typeof customers;
  deliveryPolicies: typeof deliveryPolicies;
  deliveryZones: typeof deliveryZones;
  geocode: typeof geocode;
  homepageSections: typeof homepageSections;
  http: typeof http;
  inAppNotifications: typeof inAppNotifications;
  inventory: typeof inventory;
  loyalty: typeof loyalty;
  maintenance: typeof maintenance;
  mealDeals: typeof mealDeals;
  "migrations/convertVariants": typeof migrations_convertVariants;
  notificationService: typeof notificationService;
  notifications: typeof notifications;
  offers: typeof offers;
  orderActivities: typeof orderActivities;
  orderBulk: typeof orderBulk;
  orderNotes: typeof orderNotes;
  orderWorkflow: typeof orderWorkflow;
  orders: typeof orders;
  partyPacks: typeof partyPacks;
  products: typeof products;
  razorpay: typeof razorpay;
  razorpayWebhook: typeof razorpayWebhook;
  reviews: typeof reviews;
  settings: typeof settings;
  users: typeof users;
  "utils/adminAuth": typeof utils_adminAuth;
  "utils/crypto": typeof utils_crypto;
  "utils/customerAccess": typeof utils_customerAccess;
  "utils/phone": typeof utils_phone;
  "utils/storeHours": typeof utils_storeHours;
  "utils/variantHelper": typeof utils_variantHelper;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
