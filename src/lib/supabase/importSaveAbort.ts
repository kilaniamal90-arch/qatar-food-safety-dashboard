/** Rejected when the 30s per-operation budget is exceeded. */
export const IMPORT_SAVE_TIMEOUT_MESSAGE = "TIMEOUT"

export const IMPORT_SAVE_OPERATION_MS = 30_000

export function withTimeout<T>(promise: Promise<T>, ms = IMPORT_SAVE_OPERATION_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(IMPORT_SAVE_TIMEOUT_MESSAGE)), ms)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

export function assertNavigatorOnlineForImportSave(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ImportSaveAbortError("network", "OFFLINE")
  }
}

export async function runImportSaveDbOp<T>(operation: () => PromiseLike<T>): Promise<T> {
  assertNavigatorOnlineForImportSave()
  return withTimeout(Promise.resolve(operation()), IMPORT_SAVE_OPERATION_MS)
}

export type ImportSaveFailureKind = "network" | "timeout" | "supabase"

export class ImportSaveAbortError extends Error {
  readonly kind: ImportSaveFailureKind

  constructor(kind: ImportSaveFailureKind, message: string) {
    super(message)
    this.name = "ImportSaveAbortError"
    this.kind = kind
  }
}

export function classifyImportSaveFailureMessage(raw: string): ImportSaveFailureKind {
  if (raw === IMPORT_SAVE_TIMEOUT_MESSAGE) return "timeout"
  const m = raw.toLowerCase()
  if (
    raw === "OFFLINE" ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror")
  ) {
    return "network"
  }
  return "supabase"
}

export function toImportSaveAbortError(e: unknown): ImportSaveAbortError {
  if (e instanceof ImportSaveAbortError) return e
  const msg = e instanceof Error ? e.message : String(e)
  const kind = classifyImportSaveFailureMessage(msg)
  return new ImportSaveAbortError(kind, msg)
}

export function isImportSaveAbortError(e: unknown): e is ImportSaveAbortError {
  return e instanceof ImportSaveAbortError
}
