import * as SwitchPrimitive from "@radix-ui/react-switch"
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"

import { cn } from "@/lib/utils"

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, dir: dirProp, ...props }, ref) => {
  const isRtl = dirProp === "rtl"
  const thumbTravel = isRtl
    ? "-translate-x-[3px] data-[state=checked]:-translate-x-[21px]"
    : "translate-x-[3px] data-[state=checked]:translate-x-[21px]"

  return (
    <SwitchPrimitive.Root
      ref={ref}
      dir={dirProp}
      className={cn(
        "peer inline-flex h-7 w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted transition-colors data-[state=checked]:border-gold data-[state=checked]:bg-primary dark:data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-card shadow-md ring-0 transition-transform duration-150",
          thumbTravel,
        )}
      />
    </SwitchPrimitive.Root>
  )
})
Switch.displayName = SwitchPrimitive.Root.displayName
