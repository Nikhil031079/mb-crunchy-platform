// ============================================================================
// MB Crunchy — Customer-Facing Reusable Components
// ============================================================================

// Navigation
export { Header } from "./Header";
export { Footer } from "./Footer";
export { DesktopNav, DesktopNavSkeleton } from "./DesktopNav";
export { MobileNav } from "./MobileNav";
export { BusinessUnitSwitcher, BusinessUnitSwitcherSkeleton } from "./BusinessUnitSwitcher";

// Sections
export { HeroSection, HeroSectionSkeleton } from "./HeroSection";
export { SectionHeader, SectionHeaderSkeleton } from "./SectionHeader";
export { OfferBanner, OfferBannerSkeleton } from "./OfferBanner";

// Cards
export { ProductCard, ProductCardSkeleton } from "./ProductCard";
export { ComboCard, ComboCardSkeleton } from "./ComboCard";
export { PartyPackCard, PartyPackCardSkeleton } from "./PartyPackCard";
export { CustomerReviewCard, CustomerReviewCardSkeleton } from "./CustomerReviewCard";

// Interactive
export { QuantitySelector } from "./QuantitySelector";

// Store Status
export { StoreStatusDot, StoreStatusBadge, StoreSchedule } from "./StoreStatusBadge";

// Stock
export { StockBadge, getStockStatus, getProductStockStatus } from "./StockBadge";
export type { StockStatus, StockInfo } from "./StockBadge";

// Loading
export {
  Skeleton,
  CardGridSkeleton,
  PageSkeleton,
  ListSkeleton,
  TextBlockSkeleton,
} from "./Skeleton";
