import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Always formats numbers with English/Western digits (1,234 not ١٬٢٣٤). */
export function fmtNum(n: number): string {
  return n.toLocaleString("en-US")
}

/** Format a decimal percentage with one decimal place. */
export function fmtPct(n: number): string {
  return n.toFixed(1) + "%"
}
