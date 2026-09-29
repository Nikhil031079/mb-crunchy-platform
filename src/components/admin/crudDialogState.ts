// ============================================================================
// Shared Add/Edit dialog state machine (13C form-lifecycle fix).
//
// Background: CRUD dialogs kept form values in useState initialized once per
// mount, while the mount key covered only the record id (or nothing at
// all), and the selected record was never cleared on save. As a result the
// same mounted form instance survived same-record re-edits, consecutive
// Adds, and Edit→Add transitions — showing stale values.
//
// Contract enforced here:
// - Every dialog open (Add or Edit) produces a fresh mount whose key binds
//   BOTH the record identity AND the open session, so form state always
//   hydrates from the CURRENT record prop (or clean defaults).
// - Save success closes AND clears the selection; save failure changes
//   nothing, so user-entered values stay intact.
// - User close (cancel/overlay/Escape) closes AND clears the selection.
//
// Pure, dependency-free, and unit-tested (tests/13c_admin_crud_form_state).
// ============================================================================

export interface CrudDialogState {
  open: boolean;
  editingId: string | undefined;
}

export type CrudDialogEvent =
  | { type: "openAdd" }
  | { type: "openEdit"; id: string }
  | { type: "close" }
  | { type: "saveSuccess" }
  | { type: "saveFailure" };

export const initialCrudDialogState: CrudDialogState = {
  open: false,
  editingId: undefined,
};

export function crudDialogReducer(
  _state: CrudDialogState,
  event: CrudDialogEvent,
): CrudDialogState {
  switch (event.type) {
    case "openAdd":
      return { open: true, editingId: undefined };
    case "openEdit":
      return { open: true, editingId: event.id };
    case "close":
    case "saveSuccess":
      return { open: false, editingId: undefined };
    case "saveFailure":
      return _state;
  }
}

/**
 * React key for the dialog component. EVERY transition (open, close, save,
 * record change) alters the key, so each dialog session mounts fresh and
 * hydrates from the current record/defaults — including repeated Adds and
 * same-record re-edits, which a record-id-only key would reuse.
 */
export function crudDialogKey(state: CrudDialogState): string {
  return `${state.editingId ?? "new"}-${state.open ? "open" : "closed"}`;
}
