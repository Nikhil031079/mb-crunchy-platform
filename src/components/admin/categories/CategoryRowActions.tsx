import { ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { Category } from "./types";

interface CategoryRowActionsProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onRestore: (category: Category) => void;
}

export function CategoryRowActions({ category, onEdit, onDelete, onRestore }: CategoryRowActionsProps) {
  const isArchived = category.status === "archived";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Open actions for ${category.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel>{category.name}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onEdit(category)} disabled={isArchived}><Pencil /> Edit</DropdownMenuItem>
      {isArchived ? <DropdownMenuItem onSelect={() => onRestore(category)}><ArchiveRestore /> Restore</DropdownMenuItem> : <DropdownMenuItem variant="destructive" onSelect={() => onDelete(category)}><Trash2 /> Archive</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
