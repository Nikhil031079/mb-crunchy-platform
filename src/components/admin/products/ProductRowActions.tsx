import { ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { Product } from "./types";

interface ProductRowActionsProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onRestore: (product: Product) => void;
}

export function ProductRowActions({ product, onEdit, onDelete, onRestore }: ProductRowActionsProps) {
  const isArchived = product.status === "archived";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Open actions for ${product.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel>{product.name}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onEdit(product)} disabled={isArchived}><Pencil /> Edit</DropdownMenuItem>
      {isArchived ? <DropdownMenuItem onSelect={() => onRestore(product)}><ArchiveRestore /> Restore</DropdownMenuItem> : <DropdownMenuItem variant="destructive" onSelect={() => onDelete(product)}><Trash2 /> Archive</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
