import { Loader2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ConfirmDeleteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  busy = false,
  onConfirm,
}: ConfirmDeleteProps) {
  const { i18n } = useTranslation()
  const rtl = i18n.dir() === "rtl"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={rtl ? "rtl" : "ltr"}
        className="shadow-xl sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className={rtl ? "text-end" : "text-start"}>
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className={rtl ? "text-end" : "text-start"}>
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter
          className={rtl ? "mt-8 sm:flex-row-reverse sm:justify-start" : "mt-8"}
        >
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={destructive ? "default" : "secondary"}
            className={cn(
              destructive &&
                "!bg-red-600 !text-white hover:!bg-red-700 dark:!bg-red-700 dark:hover:!bg-red-800",
            )}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : null}
            {confirmLabel ?? "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
