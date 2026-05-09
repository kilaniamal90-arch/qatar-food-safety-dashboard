import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = { children: ReactNode }

type State = { hasError: boolean }

/** Top-level boundary; message is localized via a tiny inner hook component pattern. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error boundary:", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />
    }
    return this.props.children
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background p-6"
      role="alert"
    >
      <Card className="max-w-md border-destructive/30">
        <CardHeader>
          <CardTitle>{t("errors.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("errors.body")}</p>
          <Button type="button" onClick={onRetry}>
            {t("errors.retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
