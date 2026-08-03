import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminAuth } from "@/hooks/use-admin-auth";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { OrderNote } from "@/types";

// ============================================================================
// Order Notes Panel — internal admin-only notes (add / edit / delete).
// Rendered inside the admin Order Detail dialog. No customer exposure.
// ============================================================================

interface OrderNotesPanelProps {
  orderId: string;
}

const toOrderId = (id: string) => id as unknown as Id<"orders">;
const toNoteId = (id: string) => id as unknown as Id<"orderNotes">;

export function OrderNotesPanel({ orderId }: OrderNotesPanelProps) {
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken();

  const notes = useQuery(
    api.orderNotes.getByOrder,
    sessionToken && orderId
      ? { sessionToken, orderId: toOrderId(orderId) }
      : "skip",
  );
  const addNote = useMutation(api.orderNotes.add);
  const updateNote = useMutation(api.orderNotes.update);
  const removeNote = useMutation(api.orderNotes.remove);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editing, setEditing] = useState<OrderNote | null>(null);
  const [editText, setEditText] = useState("");

  const [deleting, setDeleting] = useState<OrderNote | null>(null);

  const handleAdd = async () => {
    const text = newNote.trim();
    if (!text || !sessionToken) return;
    setIsSubmitting(true);
    try {
      await addNote({ sessionToken, orderId: toOrderId(orderId), note: text });
      toast.success("Note added");
      setNewNote("");
      setIsAddOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    const text = editText.trim();
    if (!editing || !text || !sessionToken) return;
    setIsSubmitting(true);
    try {
      await updateNote({
        sessionToken,
        noteId: toNoteId(editing._id),
        note: text,
      });
      toast.success("Note updated");
      setEditing(null);
      setEditText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || !sessionToken) return;
    setIsSubmitting(true);
    try {
      await removeNote({ sessionToken, noteId: toNoteId(deleting._id) });
      toast.success("Note deleted");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete note");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Internal Notes</h4>
        <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Add Note
        </Button>
      </div>

      {notes === undefined ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No internal notes yet. Add a note to keep track of this order.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note._id} className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-medium">{note.author}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Edit note"
                    onClick={() => {
                      setEditing(note);
                      setEditText(note.note);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    aria-label="Delete note"
                    onClick={() => setDeleting(note)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm">{note.note}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Order Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add an internal note about this order..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isSubmitting || !newNote.trim()}>
                <MessageSquarePlus className="mr-1.5 size-3.5" />
                Add Note
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-note">Note</Label>
              <Textarea
                id="edit-note"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={isSubmitting || !editText.trim()}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the note. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
