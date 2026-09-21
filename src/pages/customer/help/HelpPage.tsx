import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function HelpPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Help & Contact</h1>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact MB Crunchy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <h2 className="text-xl font-bold margin-y-4">Get in Touch</h2>
            <p>
              Have a question about your order, need help with a product, or want
              to get in touch with our team? We're here to help.
            </p>

            <h3 className="text-lg font-medium margin-y-3">Customer Support</h3>
            <p>
              <strong>WhatsApp:</strong> <a href="https://wa.me/7842032879" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-900 underline">
                7842032879
              </a>
            </p>
            <p>
              <strong>Email:</strong> <a href="mailto:support@mbcrunchy.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-900 underline">
                support@mbcrunchy.com
              </a>
            </p>

            <h3 className="text-lg font-medium margin-y-3">Helpful Links</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>
                <a href="/policy/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-600 underline">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/policy/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-600 underline">
                  Terms & Conditions
                </a>
              </li>
              <li>
                <a href="/policy/shipping" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-600 underline">
                  Shipping & Delivery Policy
                </a>
              </li>
              <li>
                <a href="/policy/refund" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-600 underline">
                  Refund & Cancellation Policy
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="mt-8 pt-8 border-t border-border/40 text-center">
          <p className="text-sm text-muted-foreground">
            © 2026 MB Crunchy. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}