import { memo } from "react";
import { Info, MessagesSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "./SectionHeader";
import { CustomerReviewCard } from "./CustomerReviewCard";

// ============================================================================
// Customer Testimonials — PLACEHOLDER (demo) content
//
// NOTE: These are sample testimonials used purely for the launch landing page.
// Replace with real customer reviews by swapping the array below with live
// data (e.g. from the reviews collection) before going to production.
// ============================================================================

interface DemoReview {
  rating: number;
  text: string;
  authorName: string;
  location: string;
  date: number;
}

const DEMO_REVIEWS: DemoReview[] = [
  {
    rating: 5,
    text: "Ordered breakfast for the whole family — everything arrived hot, fresh and beautifully packed. The delivery was faster than promised!",
    authorName: "Priya S.",
    location: "Demo Review",
    date: Date.now(),
  },
  {
    rating: 5,
    text: "The organic groceries are superb. Farm-fresh produce and pantry staples at genuinely fair prices. MB Mart is now our go-to.",
    authorName: "Rahul M.",
    location: "Demo Review",
    date: Date.now(),
  },
  {
    rating: 4.5,
    text: "Loved the party packs! Ordered combo meals for a get-together and everyone was impressed. Great value for money.",
    authorName: "Ananya K.",
    location: "Demo Review",
    date: Date.now(),
  },
  {
    rating: 5,
    text: "App is super smooth and the one-cart experience across Kitchen and Mart is brilliant. One order, one delivery — exactly what we needed.",
    authorName: "Vikram T.",
    location: "Demo Review",
    date: Date.now(),
  },
  {
    rating: 4.5,
    text: "Premium ingredients, spot-on packaging and a support team that actually responds. Highly recommended for everyday essentials.",
    authorName: "Sneha R.",
    location: "Demo Review",
    date: Date.now(),
  },
  {
    rating: 5,
    text: "The mojitos and fresh juices are amazing. Quality ingredients and consistent taste every single time. 10/10 experience.",
    authorName: "Arjun D.",
    location: "Demo Review",
    date: Date.now(),
  },
];

export const TestimonialsSection = memo(function TestimonialsSection() {
  return (
    <section className="bg-secondary/20 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center">
          <Badge
            variant="outline"
            className="mb-6 gap-1.5 border-dashed border-accent/30 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <Info className="h-3 w-3 text-accent" />
            Demo content — replace with real customer reviews
          </Badge>
        </div>

        <SectionHeader
          alignment="center"
          title="What Our Customers Say"
          subtitle="Thousands of happy orders across Kitchen and Mart — here's what people love about MB Crunchy"
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_REVIEWS.slice(0, 6).map((review, index) => (
            <CustomerReviewCard
              key={review.authorName}
              rating={review.rating}
              text={review.text}
              authorName={review.authorName}
              location={review.location}
              date={review.date}
              index={index}
            />
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <MessagesSquare className="h-3.5 w-3.5" />
          Reviews shown above are illustrative placeholders for launch.
        </div>
      </div>
    </section>
  );
});
