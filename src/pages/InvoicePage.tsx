import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { GST_STATES } from "@convex/utils/businessProfile";
import { amountInWords } from "@convex/utils/invoiceCalc";

import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const money = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export default function InvoicePage() {
  const { orderNumber = "" } = useParams();
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken() ?? undefined;

  const result = useQuery(api.invoices.getForOrder, { orderNumber, sessionToken });
  const issue = useMutation(api.invoices.issueForOrder);
  const [error, setError] = useState<string | null>(null);
  const issuing = useRef(false);

  // Issuing is idempotent on the server, so a repeat call is harmless; the ref
  // just avoids duplicate requests while one is in flight.
  useEffect(() => {
    if (result?.status !== "not_issued" || !result.canIssue || issuing.current) return;
    issuing.current = true;
    issue({ orderNumber, sessionToken })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not create the invoice"))
      .finally(() => {
        issuing.current = false;
      });
  }, [result, issue, orderNumber, sessionToken]);

  if (result === undefined) return <Message title="Loading invoice..." />;
  if (result.status === "not_found") return <Message title="Order not found" />;
  if (result.status === "forbidden") {
    return (
      <Message title="Sign in to view this invoice">
        Open it from your account&apos;s order history while signed in with the number you ordered with.{" "}
        <Link to="/account/orders" className="underline">Go to my orders</Link>
      </Message>
    );
  }
  if (result.status === "not_issued") {
    if (!result.canIssue) return <Message title="Invoice not available yet">{result.reason}</Message>;
    if (error) return <Message title="Invoice could not be created">{error}</Message>;
    return <Message title="Preparing your invoice..." />;
  }

  const inv = result.invoice;
  const isTax = inv.docType === "tax_invoice";
  const sellerName = inv.seller.legalName || inv.seller.siteName;
  const placeOfSupply = inv.placeOfSupplyStateCode ? GST_STATES[inv.placeOfSupplyStateCode] : undefined;
  const intra = inv.supplyType === "intra_state";

  return (
    <div className="min-h-screen bg-muted/30 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <Link to="/" className="text-sm underline">Back to shop</Link>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white p-6 text-[13px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-black pb-3">
          <div>
            <h1 className="text-xl font-bold">{sellerName}</h1>
            {inv.seller.address && <p className="whitespace-pre-line">{inv.seller.address}</p>}
            {inv.seller.gstin && <p>GSTIN: <span className="font-mono">{inv.seller.gstin}</span></p>}
            {inv.seller.fssaiNumber && <p>FSSAI Lic. No.: <span className="font-mono">{inv.seller.fssaiNumber}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{isTax ? "Tax Invoice" : "Bill of Supply"}</p>
            <p>No: <span className="font-mono font-semibold">{inv.invoiceNumber}</span></p>
            <p>Date: {formatDate(inv.issuedAt)}</p>
            <p>Order: <span className="font-mono">{inv.orderNumber}</span></p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 border-b border-black py-3">
          <div>
            <p className="font-semibold">Bill to / Ship to</p>
            <p>{inv.buyer.name}</p>
            <p>{inv.buyer.phone}</p>
            {inv.buyer.address && <p className="whitespace-pre-line">{inv.buyer.address}</p>}
          </div>
          <div className="text-right">
            {isTax && placeOfSupply && (
              <p>Place of supply: {placeOfSupply} ({inv.placeOfSupplyStateCode})</p>
            )}
            {inv.paymentMethod && <p>Payment: {inv.paymentMethod.toUpperCase()}</p>}
            {isTax && <p>Reverse charge: No</p>}
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="mt-3 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-black text-left">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Description</th>
                {isTax && <th className="py-1.5 pr-2">HSN</th>}
                <th className="py-1.5 pr-2 text-right">Qty</th>
                {isTax ? (
                  <>
                    <th className="py-1.5 pr-2 text-right">Taxable (₹)</th>
                    {intra ? (
                      <>
                        <th className="py-1.5 pr-2 text-right">CGST</th>
                        <th className="py-1.5 pr-2 text-right">SGST</th>
                      </>
                    ) : (
                      <th className="py-1.5 pr-2 text-right">IGST</th>
                    )}
                  </>
                ) : null}
                <th className="py-1.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line, i) => (
                <tr key={i} className="border-b border-gray-300 align-top">
                  <td className="py-1.5 pr-2">{i + 1}</td>
                  <td className="py-1.5 pr-2">{line.description}</td>
                  {isTax && <td className="py-1.5 pr-2 font-mono">{line.hsnCode ?? "-"}</td>}
                  <td className="py-1.5 pr-2 text-right">{line.quantity}</td>
                  {isTax ? (
                    <>
                      <td className="py-1.5 pr-2 text-right">{money(line.taxableValuePaise)}</td>
                      {intra ? (
                        <>
                          <td className="py-1.5 pr-2 text-right">
                            {money(line.cgstPaise)} <span className="text-gray-500">({line.ratePercent / 2}%)</span>
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            {money(line.sgstPaise)} <span className="text-gray-500">({line.ratePercent / 2}%)</span>
                          </td>
                        </>
                      ) : (
                        <td className="py-1.5 pr-2 text-right">
                          {money(line.igstPaise)} <span className="text-gray-500">({line.ratePercent}%)</span>
                        </td>
                      )}
                    </>
                  ) : null}
                  <td className="py-1.5 text-right">{money(line.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-3 flex justify-end">
          <dl className="w-72 space-y-1">
            {isTax && (
              <>
                <div className="flex justify-between"><dt>Taxable value</dt><dd>₹{money(inv.totals.taxableValuePaise)}</dd></div>
                {intra ? (
                  <>
                    <div className="flex justify-between"><dt>CGST</dt><dd>₹{money(inv.totals.cgstPaise)}</dd></div>
                    <div className="flex justify-between"><dt>SGST</dt><dd>₹{money(inv.totals.sgstPaise)}</dd></div>
                  </>
                ) : (
                  <div className="flex justify-between"><dt>IGST</dt><dd>₹{money(inv.totals.igstPaise)}</dd></div>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-black pt-1 text-base font-bold">
              <dt>Total</dt><dd>₹{money(inv.totals.grandTotalPaise)}</dd>
            </div>
          </dl>
        </section>

        <p className="mt-3 border-t border-gray-300 pt-2">
          <span className="font-semibold">Amount in words:</span> {amountInWords(inv.totals.grandTotalPaise)}
        </p>

        <footer className="mt-4 border-t border-gray-300 pt-2 text-[11px] text-gray-600">
          {isTax
            ? "Prices are inclusive of GST. This is a computer-generated invoice and needs no signature."
            : "Bill of Supply: no GST has been charged on this supply. This is a computer-generated document and needs no signature."}
        </footer>
      </article>
    </div>
  );
}
