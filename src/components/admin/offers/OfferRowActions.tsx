import { ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { Offer } from "./types";

interface OfferRowActionsProps {
  offer: Offer;
  onEdit: (offer: Offer) => void;
  onDelete: (offer: Offer) => void;
  onRestore: (offer: Offer) => void;
}

export function OfferRowActions({ offer, onEdit, onDelete, onRestore }: OfferRowActionsProps) {
  const isArchived = offer.status === "archived";
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Open actions for ${offer.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel>{offer.title}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onEdit(offer)} disabled={isArchived}><Pencil /> Edit</DropdownMenuItem>
      {isArchived ? <DropdownMenuItem onSelect={() => onRestore(offer)}><ArchiveRestore /> Restore</DropdownMenuItem> : <DropdownMenuItem variant="destructive" onSelect={() => onDelete(offer)}><Trash2 /> Archive</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
