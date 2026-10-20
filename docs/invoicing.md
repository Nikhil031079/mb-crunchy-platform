# Invoicing and GST

This is how invoices work and which assumptions need your CA's confirmation.

## What happens
- An invoice is created on demand, once per order, when the order is paid (or
  confirmed COD). Customers open it from Account > Orders > Invoice; admins
  from the order dialog. Browser "Print / Save as PDF" produces the PDF.
- Invoices are immutable snapshots. Changing settings later never rewrites
  an issued invoice.
- Cancelled and refunded orders get no invoice. **Credit notes are not built yet.**

## Document type is automatic
- No valid GSTIN saved (Admin > Settings > Business & Compliance): **Bill of
  Supply**, no GST shown.
- Valid GSTIN saved: **Tax Invoice** with HSN, CGST+SGST (same state) or IGST
  (other state). The state comes from the GSTIN and the delivery state.

## Numbering
- Tax invoice `PPPP/2627/000001`, bill of supply `PPPPB/2627/00001`.
  `PPPP` = your prefix (1-4 characters, default `INV`). Series restart every
  1 April (IST). Max 16 characters, as GST rules require.
- A number is allocated in the same database transaction that creates the
  invoice, so failures leave no gaps and duplicates are impossible.

## Pricing model
- Prices are GST-inclusive (MRP style). Tax is carved out of the price, so the
  customer's total never changes. Order-level discounts are spread across lines
  in proportion to their value before tax is calculated.
- Rates and HSN codes are set per item in Admin > GST Setup. With a GSTIN on
  file, an order containing an item with no GST rate **cannot** be invoiced
  (the system will not guess).
- The old flat per-business-unit tax rate must stay at 0. An order charged that
  flat tax is refused an invoice.

## Assumptions for your CA to confirm
1. **Delivery charges** are taxed at the highest GST rate among the goods in the
   order (mixed-supply treatment). Confirm, or tell us the correct treatment.
2. **Prepared food** sold by MB Kitchen may be taxed as restaurant/outdoor
   catering service rather than as goods. Confirm the correct rate and whether
   a different invoice format applies.
3. **Registration timing:** confirm whether you must register before selling
   inter-state, and which turnover thresholds apply to you.
4. **HSN digits** required for your turnover (4 or 6).
5. **Organic products:** keep the wholesaler's certificate number and the
   supplier's FSSAI number on file for anything labelled organic.
6. **Unregistered period:** confirm the wording on the Bill of Supply.
