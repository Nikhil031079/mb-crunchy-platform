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
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as businessUnits from "../businessUnits.js";
import type * as catalogItems from "../catalogItems.js";
import type * as categories from "../categories.js";
import type * as collections from "../collections.js";
import type * as combos from "../combos.js";
import type * as content from "../content.js";
import type * as customers from "../customers.js";
import type * as deliveryZones from "../deliveryZones.js";
import type * as homepageSections from "../homepageSections.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as loyalty from "../loyalty.js";
import type * as notifications from "../notifications.js";
import type * as offers from "../offers.js";
import type * as orders from "../orders.js";
import type * as partyPacks from "../partyPacks.js";
import type * as products from "../products.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addresses: typeof addresses;
  analytics: typeof analytics;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  businessUnits: typeof businessUnits;
  catalogItems: typeof catalogItems;
  categories: typeof categories;
  collections: typeof collections;
  combos: typeof combos;
  content: typeof content;
  customers: typeof customers;
  deliveryZones: typeof deliveryZones;
  homepageSections: typeof homepageSections;
  http: typeof http;
  inventory: typeof inventory;
  loyalty: typeof loyalty;
  notifications: typeof notifications;
  offers: typeof offers;
  orders: typeof orders;
  partyPacks: typeof partyPacks;
  products: typeof products;
  settings: typeof settings;
  users: typeof users;
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
