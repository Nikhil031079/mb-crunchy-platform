// ============================================================================
// MB CRUNCHY — 19G Homepage Sections Save Reliability Tests
//
// Verifies the Phase 19G parity fix for the one remaining genuine Admin
// Operations defect identified by the 19F checkpoint:
// HomepageSectionsPage had no duplicate-submit protection and routed
// mutation failures through the list-replacing error state.
//
// Applies the same assertions as the 19C suite, adapted to this page's
// architecture (multi-BU upsert loop in saveSection; row ops guarded by a
// shared pending key; form dialog pending state):
//  - saveSection re-entry guard + pending dialog state
//  - multi-BU upsert behavior intact
//  - toggle/move/archive pending guards + action-error handling
//  - mutation failures keep the list mounted under a dismissible banner
//  - load-error branch remains separate
//
// Uses the repo's readSource structural convention (tests 43/45/17C/19B+).
//
// RUN: SESSION_SECRET=<32+ char test secret> vitest run tests/19g_homepage_sections_reliability.test.ts
// (SESSION_SECRET is required at import time by convex/utils/crypto.ts.)
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readSource(relativePath: string): string {
  // Normalize CRLF: the repo mixes line endings and markers assume "\n".
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8").replace(/\r\n/g, "\n");
}

/** Slice a source file from a start marker to an end marker (exclusive). */
function block(src: string, start: string, end: string): string {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`start marker not found: ${start}`);
  const to = src.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`end marker not found: ${end}`);
  return src.slice(from, to);
}

const PAGE = "src/pages/admin/HomepageSectionsPage.tsx";
const DIALOG = "src/components/admin/homepage-sections/HomepageSectionFormDialog.tsx";

describe("19G — saveSection re-entry protection", () => {
  it("saveSection has the 19C re-entry guard with finally reset", () => {
    const src = readSource(PAGE);
    expect(src).toContain("const [isSaving, setIsSaving] = useState(false);");
    const fn = block(src, "const saveSection = async", "const toggleVisible = async");
    expect(fn).toContain("if (isSaving) return;");
    expect(fn).toContain("setIsSaving(true);");
    expect(fn).toContain("finally {");
    expect(fn).toContain("setIsSaving(false);");
    // Success still closes the dialog; failure leaves the draft open.
    expect(fn).toContain("setFormOpen(false);");
    expect(fn.slice(fn.indexOf("} catch"))).not.toContain("setFormOpen(false)");
  });

  it("saveSection pending state disables the submit control", () => {
    expect(readSource(PAGE)).toContain("isSaving={isSaving}");
    const dialog = readSource(DIALOG);
    expect(dialog).toContain("isSaving?: boolean");
    expect(dialog).toContain("disabled={isSaving}");
  });

  it("multi-BU upsert behavior remains intact", () => {
    const src = readSource(PAGE);
    const fn = block(src, "const saveSection = async", "const toggleVisible = async");
    // Per-target-BU upsert loop preserved…
    expect(fn).toContain("const targetBuIds = values.target === \"both\"");
    expect(fn).toContain("await upsert(buId, values, settings);");
    // …including single-store removal from the other stores…
    expect(fn).toContain("if (values.target !== \"both\")");
    // …and the upsert helper's create-or-update contract.
    const upsert = block(src, "const upsert = useCallback", "const saveSection = async");
    expect(upsert).toContain("await updateSection(");
    expect(upsert).toContain("await createSection(");
  });
});

describe("19G — row-operation pending protection", () => {
  it("toggleVisible cannot run twice in parallel and reports action errors", () => {
    const src = readSource(PAGE);
    const fn = block(src, "const toggleVisible = async", "const moveSection = async");
    expect(fn).toContain("if (pendingKey) return;");
    expect(fn).toContain("setPendingKey(row.sectionType);");
    expect(fn).toContain("finally {");
    expect(fn).toContain("setPendingKey(null);");
    expect(fn).toContain("setActionError(");
    expect(fn).toContain("Could not update section");
  });

  it("moveSection cannot run twice in parallel and reports action errors", () => {
    const src = readSource(PAGE);
    const fn = block(src, "const moveSection = async", "const archiveSection = async");
    expect(fn).toContain("if (pendingKey) return;");
    expect(fn).toContain("setPendingKey(rows[index].sectionType);");
    expect(fn).toContain("setPendingKey(null);");
    expect(fn).toContain("setActionError(");
    expect(fn).toContain("Could not reorder sections");
    // Existing bounds guard and reorder contract preserved.
    expect(fn).toContain("if (target < 0 || target >= rows.length) return;");
    expect(fn).toContain("await reorderSections(");
  });

  it("archiveSection cannot run twice in parallel and reports action errors", () => {
    const src = readSource(PAGE);
    const fn = block(src, "const archiveSection = async", "const openCreateDialog = ()");
    expect(fn).toContain("if (!deleteTarget || pendingKey) return;");
    expect(fn).toContain("setPendingKey(deleteTarget.sectionType);");
    expect(fn).toContain("setPendingKey(null);");
    expect(fn).toContain("setActionError(");
    expect(fn).toContain("Could not delete section");
    // Success still clears the confirm target.
    expect(fn).toContain("setDeleteTarget(undefined);");
  });
});

describe("19G — mutation error UX", () => {
  it("mutation failures keep the list mounted under a dismissible banner", () => {
    const src = readSource(PAGE);
    expect(src).toContain("setActionError(");
    expect(src).toContain("{actionError ?");
    expect(src).toContain("onClick={() => setActionError(null)}");
    expect(src).toContain("Could not save section");
    const errorGate = src.indexOf("{error ?");
    const sectionIdx = src.indexOf('aria-label="Homepage section management"');
    expect(errorGate).toBeGreaterThanOrEqual(0);
    expect(sectionIdx).toBeGreaterThan(errorGate);
    expect(src.indexOf("{actionError ?")).toBeLessThan(errorGate);
    // No mutation catch feeds the list-replacing load error anymore.
    for (const c of src.split("} catch (err) {").slice(1)) {
      expect(c.slice(0, c.indexOf("}"))).not.toContain("setError(");
    }
  });

  it("query/load error behavior remains separate", () => {
    const src = readSource(PAGE);
    expect(src).toContain("{error ?");
    expect(src).toContain("Could not save changes");
    expect(src).toContain("onClick={() => setError(null)}");
  });
});
