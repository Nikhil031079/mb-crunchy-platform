import { ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { Combo } from "./types";

interface ComboRowActionsProps {
  combo: Combo;
  onEdit: (combo: Combo) => void;
  onDelete: (combo: Combo) => void;
  onRestore: (combo: Combo) => void;
}

export function ComboRowActions({ combo, onEdit, onDelete, onRestore }: ComboRowActionsProps) {
  const isArchived = combo.status === "archived";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Open actions for ${combo.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel>{combo.name}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onEdit(combo)} disabled={isArchived}><Pencil /> Edit</DropdownMenuItem>
      {isArchived ? <DropdownMenuItem onSelect={() => onRestore(combo)}><ArchiveRestore /> Restore</DropdownMenuItem> : <DropdownMenuItem variant="destructive" onSelect={() => onDelete(combo)}><Trash2 /> Archive</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
