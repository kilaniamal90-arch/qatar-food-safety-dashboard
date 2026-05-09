import { establishments } from "@/data/establishments"
import { buildInspections } from "@/data/mockBuilder"

/** 630 inspections aligned to establishment names (deterministically generated). */
export const inspections = buildInspections(establishments)
