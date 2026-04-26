import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium tracking-tight transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-stone-100 text-foreground',
        accent: 'bg-court-green/10 text-court-green border-court-green/20',
        warning: 'bg-amber/10 text-amber border-amber/20',
        danger: 'bg-danger/10 text-danger border-danger/20',
        success: 'bg-court-green/10 text-court-green border-court-green/20',
        muted: 'bg-stone-100 text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
