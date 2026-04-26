'use client';

/**
 * shadcn/ui 風 Tooltip（@radix-ui/react-tooltip ベース）
 *
 * Radix overlay 系（Tooltip / Dialog / Dropdown 等）の wrapper は必ず 'use client'。
 * Server Component から直接 Radix Primitive を import すると useId / portal で hydration mismatch を起こす。
 *
 * MVP の export は以下のみ:
 *  - TooltipProvider（root に一度だけ置く / または各箇所で囲む）
 *  - Tooltip = Root
 *  - TooltipTrigger
 *  - TooltipContent
 */
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils/cn';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
