import { AlertTriangleIcon, Loader2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type DeleteInspectionConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  details?: string[]
  warning?: string
  cancelLabel: string
  confirmLabel: string
  deleting?: boolean
  onConfirm: () => void
  dir?: "ltr" | "rtl"
}

export function DeleteInspectionConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  details,
  warning,
  cancelLabel,
  confirmLabel,
  deleting = false,
  onConfirm,
  dir = "ltr",
}: DeleteInspectionConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && deleting) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent className="max-w-md" dir={dir}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-muted-foreground">
              <p className="text-sm text-foreground">{message}</p>

              {details?.length ? (
                <div className="space-y-1 rounded-md bg-muted/50 p-3">
                  {details.map((line, i) => (
                    <p key={i} className="text-sm text-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}

              {warning ? (
                <p className="text-sm font-medium text-red-600">⚠️ {warning}</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 sm:gap-3">
          <AlertDialogCancel disabled={deleting}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {deleting ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
