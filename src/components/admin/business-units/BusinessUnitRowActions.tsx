import { ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { BusinessUnit } from "./types";

interface BusinessUnitRowActionsProps {
  businessUnit: BusinessUnit;
  onEdit: (businessUnit: BusinessUnit) => void;
  onDelete: (businessUnit: BusinessUnit) => void;
  onRestore: (businessUnit: BusinessUnit) => void;
}

export function BusinessUnitRowActions({ businessUnit, onEdit, onDelete, onRestore }: BusinessUnitRowActionsProps) {
  const isArchived = businessUnit.status === "archived";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Open actions for ${businessUnit.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel>{businessUnit.name}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onEdit(businessUnit)} disabled={isArchived}><Pencil /> Edit</DropdownMenuItem>
      {isArchived ? <DropdownMenuItem onSelect={() => onRestore(businessUnit)}><ArchiveRestore /> Restore</DropdownMenuItem> : <DropdownMenuItem variant="destructive" onSelect={() => onDelete(businessUnit)}><Trash2 /> Archive</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
