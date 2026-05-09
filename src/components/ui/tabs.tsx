/* eslint-disable react-refresh/only-export-components -- Tabs primitives */
import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

export const Tabs = TabsPrimitive.Root

export const TabsList = ({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.List> | null>
}) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto w-full gap-2 overflow-x-auto rounded-xl border border-border/80 bg-card p-2 shadow-sm backdrop-blur-sm dark:bg-muted/30 dark:border-border md:flex-wrap",
      className,
    )}
    {...props}
  />
)
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = ({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.Trigger> | null>
}) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium outline-none ring-offset-background transition-all",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-45",
      "shadow-sm bg-background/95 text-muted-foreground border-border/70",
      "data-[state=active]:border-primary data-[state=active]:border data-[state=active]:border-gold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md",
      "data-[state=inactive]:hover:bg-muted hover:text-foreground hover:border-border hover:shadow",
      className,
    )}
    {...props}
  />
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = ({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
  ref?: React.RefObject<React.ElementRef<typeof TabsPrimitive.Content> | null>
}) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-6 outline-none data-[state=inactive]:hidden", className)}
    {...props}
  />
)
TabsContent.displayName = TabsPrimitive.Content.displayName
