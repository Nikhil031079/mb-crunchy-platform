import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MB Crunchy Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold margin-y-4">Introduction</h2>
            <p>
              MB Crunchy ("we", "us", "our") operates the MB Crunchy marketplace.
              This page informs you of our policies regarding the collection,
              use, and disclosure of personal data when you use our service.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Information We Collect</h2>
            <p>
              We collect personal data that you provide directly, such as:
            </p>
            <ul>
              <li>Name and contact information (phone, email)</li>
              <li>Delivery address</li>
              <li>Order history</li>
              <li>Payment information</li>
            </ul>

            <h2 className="text-xl font-bold margin-y-4">How We Use Your Information</h2>
            <p>
              We use your information to process orders, communicate with you,
              improve our service, and comply with legal obligations.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Data Retention</h2>
            <p>
              We retain your data for as long as necessary to provide our services
              and comply with legal obligations.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data.
              Contact us if you wish to exercise these rights.
            </p>

            <h2 className="text-xl font-bold margin-y-4">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify
              of any changes by posting the new Privacy Policy on this page.
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