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

export type DeleteEstablishmentConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  establishmentName: string
  inspectionCount: number
  deleting?: boolean
  onConfirm: () => void
}

export function DeleteEstablishmentConfirmDialog({
  open,
  onOpenChange,
  establishmentName,
  inspectionCount,
  deleting = false,
  onConfirm,
}: DeleteEstablishmentConfirmDialogProps) {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language.startsWith("ar")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        dir={isRtl ? "rtl" : "ltr"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-destructive">
            {t("establishmentsPage.deleteDialog.confirmTitle")}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2 text-start text-foreground">
              <p className="text-sm font-medium leading-relaxed">
                {t("establishmentsPage.deleteDialog.message", {
                  name: establishmentName,
                })}
              </p>
              <ul className="list-disc space-y-2 ps-5 text-sm text-muted-foreground">
                <li>
                  {t("establishmentsPage.deleteDialog.warningInspections", {
                    count: inspectionCount,
                  })}
                </li>
                <li>{t("establishmentsPage.deleteDialog.warningUndo")}</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter
          className={cn("gap-2 sm:gap-2", isRtl && "sm:flex-row-reverse")}
        >
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            {t("dataImport.cancel")}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={deleting}
            className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {deleting ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("establishmentsPage.deleteDialog.confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
