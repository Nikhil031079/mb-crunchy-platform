import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsAndConditionsPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Terms & Conditions</h1>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MB Crunchy Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold margin-y-4">Acceptance</h2>
            <p>
              These Terms & Conditions ("Agreement") govern your use of the MB
              Crunchy website and mobile application. By accessing or using the
              Service, you agree to be bound by this Agreement.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Orders</h2>
            <p>
              All orders are subject to availability and confirmation. MB Crunchy
              reserves the right to decline any order for any reason. Prices and
              products are subject to change without notice.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Delivery</h2>
            <p>
              Delivery availability and charges are determined at checkout based
              on your location. Delivery times are estimates and not guaranteed.
              Additional charges may apply for delivery outside the service area.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Account</h2>
            <p>
              You must be at least 18 years old to use our service. You are
              responsible for maintaining the security of your account and for
              all activities that occur under your account.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Intellectual Property</h2>
            <p>
              The content, features, and functionality of MB Crunchy are owned by
              MB Crunchy and its licensors. The Service is protected by copyright,
              trademark, and other laws of India and foreign countries.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Limitation of Liability</h2>
            <p>
              MB Crunchy shall not be liable for any indirect, incidental,
              consequential, or punitive damages, including without limitation
              loss of data, lost profits, or other damages.
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