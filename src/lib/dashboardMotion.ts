import type { Variants } from "framer-motion"

export const dashboardSectionContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.13,
      delayChildren: 0.06,
    },
  },
}

export const dashboardSectionItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: [0.22, 0.61, 0.36, 1],
    },
  },
}
