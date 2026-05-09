import { motion, useReducedMotion } from "framer-motion"
import { ConstructionIcon } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function ComingSoon({ label }: { label?: string }) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const title = label ?? t("comingSoon.title")

  const progressValue = useMemo(() => {
    // Subtle indeterminate-like sweep using a stable published slice.
    return 62
  }, [])

  return (
    <Card className="mx-auto max-w-lg border-dashed border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <motion.div
            animate={
              reduce
                ? undefined
                : { rotate: [0, 4, -4, 0], scale: [1, 1.03, 1] }
            }
            transition={
              reduce
                ? undefined
                : { repeat: Number.POSITIVE_INFINITY, duration: 5, ease: "easeInOut" }
            }
            className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-hidden
          >
            <ConstructionIcon className="size-5" strokeWidth={1.75} />
          </motion.div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("comingSoon.body")}
        </p>
        <div className="space-y-2" dir="ltr">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("comingSoon.progressLabel")}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} />
        </div>
        <div className="flex gap-1.5 pt-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-gold/70"
              animate={
                reduce
                  ? undefined
                  : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }
              }
              transition={
                reduce
                  ? undefined
                  : {
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 1.1,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }
              }
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
