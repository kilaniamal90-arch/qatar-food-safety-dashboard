import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        gold: "border-transparent bg-gold/25 text-primary dark:bg-gold/20",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
        warning:
          "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
