"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = M.Root;
const DropdownMenuTrigger = M.Trigger;

function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={4}
        align="end"
        className={cn("z-50 min-w-48 rounded-xl border bg-card p-1 shadow-lg", className)}
        {...props}
      />
    </M.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger };
