import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function RefundAndCancellationPolicyPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Refund & Cancellation Policy</h1>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MB Crunchy Refund & Cancellation Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold margin-y-4">Cancellation</h2>
            <p>
              You may cancel your order before it enters the preparation stage.
              Once an order is marked as "preparing", cancellation is no longer
              possible through the customer portal. Contact customer support to
              inquire about cancellation requests for orders in preparation.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Refunds for Cancelled Orders</h2>
            <p>
              Refunds for cancelled orders are processed within 3-5 business days.
              The refund will be issued to the original payment method. If you
              paid via cash on delivery or a payment link, refund details will be
              communicated via the contact method provided at checkout.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Refunds for Returned Items</h2>
            <p>
              Perishable food items must be inspected at the time of delivery.
              Returns for damaged or incorrect items must be reported within 48
              hours of delivery. Approved refunds are processed within 3-5 business
              days to the original payment method.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Non-returnable Items</h2>
            <p>
              Certain items cannot be returned, including perishable goods that
              have been partially consumed, items past their use-by date, and
              personalized or special-order products.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Contact for Refunds</h2>
            <p>
              For refund requests, please contact customer support with your order
              number and a description of the issue. Refunds are assessed on a
              case-by-case basis in accordance with this policy.
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