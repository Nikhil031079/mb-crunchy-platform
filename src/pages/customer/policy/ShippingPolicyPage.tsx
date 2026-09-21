import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ShippingPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Shipping & Delivery Policy</h1>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MB Crunchy Shipping & Delivery Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold margin-y-4">Delivery Zones</h2>
            <p>
              MB Crunchy delivers to select areas within our service radius. Delivery
              availability is determined at checkout based on your delivery address or
              pincode. Orders placed outside our delivery zones may be declined or
              offered an alternative delivery option.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Delivery Timeframes</h2>
            <p>
              Estimated delivery times are shown at checkout and depend on product
              availability, location, and store operating hours. Kitchen orders
              typically arrive within 30-45 minutes. Mart delivery times vary by
              product and location. Exact timing will be confirmed when your order
              is dispatched.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Delivery Charges</h2>
            <p>
              Delivery fees are calculated based on order value, delivery distance,
              and store policy. Free delivery is available on orders above the
              threshold displayed at checkout. Minimum order values may apply for
              local delivery.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Pickup</h2>
            <p>
              Customers may choose pickup at checkout. Orders will be ready for
              pickup within the store's operating hours. A default pickup estimate
              of 15-20 minutes is provided at checkout. Collect your order at the
              designated store counter.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Outside-Area Delivery</h2>
            <p>
              For delivery outside our standard service area, a separate delivery
              quote will be provided. Delivery charges and timelines for outside-area
              orders are confirmed via direct contact (typically WhatsApp) after
              order submission. Payment is required for the order total; delivery
              charges are confirmed separately.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Delivery Exclusions</h2>
            <p>
              Delivery may not be available for certain items (e.g., alcohol,
              age-restricted products), large or fragile items, or areas where
              local regulations restrict delivery. MB Crunchy reserves the right
              to decline delivery to any location.
            </p>
          </CardContent>
        </Card>

        <div className="mt-8 pt-8 border-t border-border/40 text-center">
          <p className="text-sm text-muted-foreground">
            Last updated: September 2026
          </p>
        </div>
      </div>
    </div>
  );
}