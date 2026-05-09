import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"

import { cn } from "@/lib/utils"

import "react-day-picker/style.css"

export type CalendarProps = DayPickerProps

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute start-1 inline-flex size-8 items-center justify-center rounded-md border border-border bg-background",
          "opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        button_next: cn(
          "absolute end-1 inline-flex size-8 items-center justify-center rounded-md border border-border bg-background",
          "opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
        week: "flex w-full mt-2",
        day: "size-9 text-center text-sm p-0 relative rounded-md",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected:
          "rounded-md bg-[#8B1538] text-white hover:bg-[#8B1538] hover:text-white focus:bg-[#8B1538] focus:text-white",
        today: "text-[#8B1538] font-semibold",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="size-4" aria-hidden />
          ) : (
            <ChevronRightIcon className="size-4" aria-hidden />
          ),
        ...components,
      }}
      {...props}
    />
  )
}
