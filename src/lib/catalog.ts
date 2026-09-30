// ============================================================================
// Catalog presentation helpers — shared by BusinessUnitPage and CategoryPage
// (Phase 21C). Pure functions only: no React, no data fetching, no backend.
//
// Consolidating this here is what guarantees search + category scope + sort
// compose identically on every catalog surface.
// ============================================================================

export type SortOption =
  | "default"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

export const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: "Default", value: "default" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Name: A to Z", value: "name-asc" },
  { label: "Name: Z to A", value: "name-desc" },
];

/** Minimum shape a catalog row needs for search + sort. */
export interface CatalogSearchableItem {
  name: string;
  price: number;
  description?: string;
  tags?: string[];
}

export interface CatalogQuery {
  /** Free-text query matched against name, description and tags. */
  searchQuery?: string;
  sortBy?: SortOption;
}

/** True when the item matches the query (an empty query matches everything). */
export function matchesCatalogSearch<T extends CatalogSearchableItem>(
  item: T,
  searchQuery?: string,
): boolean {
  const q = searchQuery?.trim().toLowerCase();
  if (!q) return true;

  if (item.name.toLowerCase().includes(q)) return true;
  if (item.description && item.description.toLowerCase().includes(q)) return true;
  if (item.tags && item.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
  return false;
}

/** Returns a sorted copy; "default"/undefined preserves source order. */
export function sortCatalogItems<T extends CatalogSearchableItem>(
  items: T[],
  sortBy?: SortOption,
): T[] {
  const list = [...items];
  switch (sortBy) {
    case "price-asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      list.sort((a, b) => b.price - a.price);
      break;
    case "name-asc":
      list.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      list.sort((a, b) => b.name.localeCompare(a.name));
      break;
    default:
      break;
  }
  return list;
}

/**
 * Single catalog pipeline: search filter → sort.
 *
 * Deliberately composable — there is intentionally no early return, so an
 * active search query can never bypass the selected sort order.
 *
 * Category scoping is applied by the caller BEFORE this runs (items arrive
 * already scoped to the active category), which keeps Kitchen and Mart
 * categories isolated from one another.
 */
export function filterAndSortCatalogItems<T extends CatalogSearchableItem>(
  items: T[],
  query: CatalogQuery = {},
): T[] {
  const filtered = items.filter((item) => matchesCatalogSearch(item, query.searchQuery));
  return sortCatalogItems(filtered, query.sortBy);
}
