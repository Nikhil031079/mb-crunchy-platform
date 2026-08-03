// ============================================================================
// MB Crunchy — Customer-Facing Reusable Components
// ============================================================================

// Navigation
export { Header } from "./Header";
export { Footer } from "./Footer";
export { DesktopNav, DesktopNavSkeleton } from "./DesktopNav";
export { MobileNav } from "./MobileNav";
export { MobileBottomBar } from "./MobileBottomBar";
export { BusinessUnitSwitcher, BusinessUnitSwitcherSkeleton } from "./BusinessUnitSwitcher";

// Sections
export { HeroSection, HeroSectionSkeleton } from "./HeroSection";
export { SectionHeader, SectionHeaderSkeleton } from "./SectionHeader";
export { OfferBanner, OfferBannerSkeleton } from "./OfferBanner";
export { DeliveryInfoStrip } from "./DeliveryInfoStrip";
export { TestimonialsSection } from "./TestimonialsSection";
export { BestSellersSection } from "./BestSellersSection";
export { ComboOffersSection } from "./ComboOffersSection";
export { CategoryNavBar } from "./CategoryNavBar";
export { CategoryEmptyState } from "./CategoryEmptyState";

// Marketing & Dynamic Homepage (Sprint 4)
export { PromoBannerStrip } from "./PromoBannerStrip";
export { FeaturedOffersSection } from "./FeaturedOffersSection";
export { PartyPacksSection } from "./PartyPacksSection";
export { FlashSalesSection } from "./FlashSalesSection";
export { HappyHourBanner } from "./HappyHourBanner";
export { ContentSection } from "./ContentSection";
export { BusinessUnitSections, BusinessUnitSectionSkeleton } from "./BusinessUnitSections";
export { HomepageSectionRenderer } from "./HomepageSectionRenderer";
export { CountdownTimer } from "./CountdownTimer";
export type { CountdownParts } from "./CountdownTimer";

// Merchandising & Personalization (Sprint 4, Phase 3)
export { ProductGridSection } from "./ProductGridSection";
export { RecentlyViewedSection } from "./RecentlyViewedSection";
export { ContinueShoppingSection } from "./ContinueShoppingSection";
export { RecommendedForYouSection } from "./RecommendedForYouSection";
export { TrendingNowSection } from "./TrendingNowSection";
export { FrequentlyBoughtTogetherSection } from "./FrequentlyBoughtTogetherSection";
export { CrossSellSections } from "./CrossSellSections";
export { SeasonalSection } from "./SeasonalSection";

// Cards
export { ProductCard, ProductCardSkeleton } from "./ProductCard";
export { ComboCard, ComboCardSkeleton } from "./ComboCard";
export { PartyPackCard, PartyPackCardSkeleton } from "./PartyPackCard";
export { CustomerReviewCard, CustomerReviewCardSkeleton } from "./CustomerReviewCard";

// Interactive
export { QuantitySelector } from "./QuantitySelector";

// Collections
export { CollectionGrid } from "./CollectionGrid";

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
