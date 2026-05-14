/** Escape text for safe insertion into HTML body (not for unquoted attributes). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export type EstablishmentPrintField = { label: string; value: string }

export type EstablishmentPrintInspectionRow = {
  num: number
  date: string
  rating: string
  inspector: string
  ref: string
  task: string
  note?: string
}

export type EstablishmentPrintTrendItem = {
  dateLabel: string
  ratingLabel: string
  score: number
}

export function buildEstablishmentPrintHtml(opts: {
  dir: "rtl" | "ltr"
  lang: string
  documentTitle: string
  printHeaderTitle: string
  printHeaderName: string
  printHeaderActivity: string
  printIssueDateLabel: string
  printIssueDateFormatted: string
  sectionEstablishment: string
  sectionInspections: string
  sectionTrend: string
  printChartCaption: string
  printChartUnavailable: string
  emptyInspections: string
  chartNotEnough: string
  /** Captured Recharts PNG data URL; when set, shown on print page 2 */
  chartImageDataUrl?: string | null
  /** Establishment notes — shown on page 2 after the chart when non-empty */
  establishmentNotesPrint?: string | null
  /** Section heading for printed notes (e.g. Notes / الملاحظات) */
  sectionNotesTitle?: string
  tableNum: string
  tableDate: string
  tableRating: string
  tableInspector: string
  tableRef: string
  tableTask: string
  fields: EstablishmentPrintField[]
  photoUrl: string | null
  inspections: EstablishmentPrintInspectionRow[]
  trendItems: EstablishmentPrintTrendItem[]
}): string {
  const ta = opts.dir === "rtl" ? "right" : "left"
  const fieldsHtml = opts.fields
    .map(
      (f) =>
        `<div class="field"><span class="label">${escapeHtml(f.label)}</span> ${escapeHtml(f.value)}</div>`,
    )
    .join("\n")

  const photoHtml =
    opts.photoUrl && opts.photoUrl.trim() !== ""
      ? `<div class="photo-wrap"><img src="${escapeHtml(opts.photoUrl.trim())}" alt="" class="photo"/></div>`
      : ""

  const inspectionsBody =
    opts.inspections.length === 0
      ? `<p class="muted">${escapeHtml(opts.emptyInspections)}</p>`
      : `<table>
  <thead>
    <tr>
      <th>${escapeHtml(opts.tableNum)}</th>
      <th>${escapeHtml(opts.tableDate)}</th>
      <th>${escapeHtml(opts.tableRating)}</th>
      <th>${escapeHtml(opts.tableInspector)}</th>
      <th>${escapeHtml(opts.tableRef)}</th>
      <th>${escapeHtml(opts.tableTask)}</th>
    </tr>
  </thead>
  <tbody>
${opts.inspections
  .map(
    (r) => `    <tr>
      <td>${r.num}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.rating)}</td>
      <td>${escapeHtml(r.inspector)}</td>
      <td>${escapeHtml(r.ref)}</td>
      <td>${escapeHtml(r.task)}</td>
    </tr>`,
  )
  .join("\n")}
  </tbody>
</table>
${opts.inspections
  .filter((r) => r.note?.trim())
  .map(
    (r) =>
      `<p class="note-line"><strong>${escapeHtml(r.ref !== "—" ? r.ref : String(r.num))}:</strong> ${escapeHtml(r.note!.trim())}</p>`,
  )
  .join("\n")}`

  const trendListHtml =
    opts.trendItems.length >= 2
      ? `<ul class="trend-list">${opts.trendItems
          .map(
            (p) =>
              `<li>${escapeHtml(p.dateLabel)} — ${escapeHtml(p.ratingLabel)} <span class="muted">(${p.score}/6)</span></li>`,
          )
          .join("")}</ul>`
      : ""

  const chartImg = opts.chartImageDataUrl?.trim()
    ? `<div class="chart-container-print chart-img-wrap"><img src="${opts.chartImageDataUrl}" alt="Rating trend chart" class="print-chart-img"/></div>`
    : ""

  const trendPageInner =
    opts.trendItems.length < 2
      ? `<p class="muted">${escapeHtml(opts.chartNotEnough)}</p>`
      : opts.chartImageDataUrl?.trim()
        ? `${chartImg}<p class="chart-caption">${escapeHtml(opts.printChartCaption)}</p>`
        : `<p class="muted chart-unavailable">${escapeHtml(opts.printChartUnavailable)}</p>${trendListHtml}`

  const notesTrim = opts.establishmentNotesPrint?.trim() ?? ""
  const notesBlock =
    notesTrim && opts.sectionNotesTitle
      ? `<h3 class="notes-section-heading">${escapeHtml(opts.sectionNotesTitle)}</h3><div class="est-notes">${escapeHtml(notesTrim)}</div>`
      : ""

  const html = `<!DOCTYPE html>
<html dir="${opts.dir}" lang="${escapeHtml(opts.lang)}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=0.95"/>
<title>${escapeHtml(opts.documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body {
    width: 210mm;
    max-width: 100%;
    height: auto;
    min-height: 297mm;
  }
  body {
    font-family: 'Noto Sans Arabic', Arial, sans-serif;
    padding: 24px;
    color: #111;
    background: #fff;
    text-align: ${ta};
    direction: ${opts.dir};
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #8b1538;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .print-doc-title {
    color: #8b1538;
    text-align: center;
    margin: 0 0 5px;
    font-size: 1.4rem;
  }
  .print-doc-name {
    text-align: center;
    margin: 5px 0;
    font-size: 20px;
    font-weight: 700;
    color: #111;
  }
  .print-doc-activity {
    text-align: center;
    color: #666;
    margin: 5px 0;
    font-size: 16px;
  }
  .print-doc-issue {
    text-align: center;
    color: #888;
    font-size: 14px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #ddd;
  }
  h3 {
    color: #8B1538;
    font-size: 1.05rem;
    margin: 28px 0 12px;
    border-bottom: 1px solid #d4a5b5;
    padding-bottom: 6px;
    page-break-after: avoid;
  }
  .field { margin: 10px 0; white-space: pre-wrap; }
  .label { font-weight: 700; color: #8B1538; }
  .muted { color: #555; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 0.85rem;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 8px;
    text-align: ${ta};
  }
  thead th {
    background: #8B1538;
    color: #fff;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  tbody tr:nth-child(even) { background: #f9f9f9; }
  .trend-list { margin: 8px 0; padding-left: 20px; }
  [dir="rtl"] .trend-list { padding-left: 0; padding-right: 20px; }
  .trend-list li { margin: 6px 0; }
  .photo-wrap { margin: 12px 0; }
  .photo { max-height: 220px; max-width: 100%; border: 1px solid #ddd; }
  .note-line { font-size: 0.85rem; margin: 6px 0; }
  .print-trend-page {
    page-break-before: always;
    break-before: page;
    padding-top: 8px;
    width: 100%;
    max-width: 100%;
  }
  .chart-container-print.chart-img-wrap {
    width: 100%;
    margin: 20px auto;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .chart-img-wrap {
    text-align: center;
  }
  .print-chart-img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    object-fit: contain;
    margin: 0 auto;
    border-radius: 8px;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .chart-caption {
    text-align: center;
    color: #666;
    font-size: 14px;
    margin: 12px 0 0;
  }
  .chart-unavailable { margin-top: 16px; margin-bottom: 8px; }
  .est-notes {
    margin-top: 8px;
    margin-bottom: 12px;
    white-space: pre-wrap;
    font-size: 0.95rem;
    line-height: 1.5;
    text-align: start;
  }
  .notes-section-heading { margin-top: 20px; }
  @media print {
    @page {
      size: A4;
      margin: 10mm;
    }

    html, body {
      width: 100%;
      max-width: none;
      height: auto;
      min-height: 0;
    }

    body {
      margin: 0;
      padding: 0;
      width: 100%;
      transform-origin: top left;
      zoom: 0.95;
    }

    .print-container {
      width: 100%;
      max-width: 100%;
      transform: scale(0.95);
      transform-origin: top center;
    }

    * {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    table,
    img,
    svg {
      page-break-inside: avoid;
    }
  }
</style>
</head>
<body>
<div class="print-container">
  <header class="header">
    <h1 class="print-doc-title">${escapeHtml(opts.printHeaderTitle)}</h1>
    <h2 class="print-doc-name">${escapeHtml(opts.printHeaderName)}</h2>
    <p class="print-doc-activity">${escapeHtml(opts.printHeaderActivity)}</p>
    <p class="print-doc-issue">${escapeHtml(opts.printIssueDateLabel)}: ${escapeHtml(opts.printIssueDateFormatted)}</p>
  </header>
  <h3>📋 ${escapeHtml(opts.sectionEstablishment)}</h3>
  <section>${fieldsHtml}</section>
  ${photoHtml}
  <h3>${escapeHtml(opts.sectionInspections)}</h3>
  ${inspectionsBody}
  <section class="print-trend-page">
    <h3>${escapeHtml(opts.sectionTrend)}</h3>
    ${trendPageInner}
    ${notesBlock}
  </section>
</div>
</body>
</html>`

  if (import.meta.env.DEV) {
    console.log(
      "[establishmentPrint] HTML built:",
      html.length,
      "chars; preview:",
      html.slice(0, 120).replace(/\s+/g, " "),
    )
  }

  return html
}

/**
 * When `window.open` is blocked or unreliable (common on Android Chrome), load the blob document in an
 * iframe and call print after `load` plus a delay so layout and chart images settle (Android often prints
 * blank if print() runs too early).
 */
function printEstablishmentFromBlobUrlInIframe(
  blobUrl: string,
  androidLayout: boolean,
  htmlContent: string,
  /** Delay after iframe load when not on Android (chart-aware delays apply only to Android). */
  delayAfterLoadNonAndroidMs: number,
): boolean {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = androidLayout
    ? "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:2147483647"
    : "position:fixed;inset:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none"

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      URL.revokeObjectURL(blobUrl)
    } catch {
      /* ignore */
    }
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  try {
    document.body.appendChild(iframe)
  } catch {
    try {
      URL.revokeObjectURL(blobUrl)
    } catch {
      /* ignore */
    }
    return false
  }

  const postLoadDelayMs = androidLayout
    ? htmlContent.includes("print-chart-img") || htmlContent.includes("chart-image")
      ? 3_500
      : 2_500
    : delayAfterLoadNonAndroidMs

  const runPrint = () => {
    const win = iframe.contentWindow
    if (!win) {
      cleanup()
      return
    }

    try {
      void win.document.body?.offsetHeight
    } catch {
      /* ignore */
    }

    const onAfterPrint = () => {
      cleanup()
      win.removeEventListener("afterprint", onAfterPrint)
    }
    win.addEventListener("afterprint", onAfterPrint)
    window.setTimeout(() => {
      if (!cleaned) cleanup()
    }, 120_000)

    try {
      win.focus()
      win.print()
    } catch (err) {
      console.error("[establishmentPrint] Print failed:", err)
      cleanup()
    }
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) {
      window.setTimeout(runPrint, postLoadDelayMs)
      return
    }
    // Wait for fonts to load
    if (win.document.fonts) {
      void win.document.fonts.ready.then(() => {
        window.setTimeout(runPrint, androidLayout ? 800 : 300)
      })
    } else {
      window.setTimeout(runPrint, postLoadDelayMs)
    }
  }

  iframe.src = blobUrl

  return true
}

/**
 * Last resort: open the print document in this tab so the user can use the browser print action.
 * Does not revoke `blobUrl` (document is now showing it).
 */
function openBlobPrintInSameTab(blobUrl: string): void {
  window.location.assign(blobUrl)
}

/**
 * Load HTML via Blob URL. Android: iframe + long delay (avoids popup/tab print bugs). Others: new tab when allowed.
 */
export function openEstablishmentPrintWindow(html: string): boolean {
  if (!html.trim()) {
    if (import.meta.env.DEV) console.warn("[establishmentPrint] empty HTML string")
    return false
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  const isAndroid = /Android/i.test(ua)
  const isMobile = /Android|iPhone|iPad/i.test(ua)
  const hasHeavyPrint = html.includes("print-chart-img")

  /** Non-Android iframe path: delay after `load` before print (Android uses chart-aware delays inside iframe helper). */
  const delayAfterLoadIframeNonAndroid = hasHeavyPrint ? 900 : 450

  const delayAfterLoadPopup = isMobile ? (hasHeavyPrint ? 2_000 : 1_200) : hasHeavyPrint ? 1_000 : 550

  const openDelayMs = isAndroid ? 450 : 300

  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const popupUrl = URL.createObjectURL(blob)

  const runIframePrint = (blobUrl: string, androidLayout: boolean): boolean => {
    const ok = printEstablishmentFromBlobUrlInIframe(
      blobUrl,
      androidLayout,
      html,
      delayAfterLoadIframeNonAndroid,
    )
    if (!ok) {
      if (import.meta.env.DEV) {
        console.warn("[establishmentPrint] iframe print failed — opening document in same tab")
      }
      openBlobPrintInSameTab(blobUrl)
    }
    return true
  }

  if (isAndroid) {
    window.setTimeout(() => {
      void runIframePrint(popupUrl, true)
    }, openDelayMs)
    return true
  }

  const w = window.open(popupUrl, "_blank", "width=960,height=840")

  if (!w || w.closed) {
    if (import.meta.env.DEV) {
      console.warn(
        "[establishmentPrint] window.open blocked or closed — using iframe / same-tab fallback",
      )
    }
    try {
      URL.revokeObjectURL(popupUrl)
    } catch {
      /* ignore */
    }
    const fallbackUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    window.setTimeout(() => {
      void runIframePrint(fallbackUrl, false)
    }, openDelayMs)
    return true
  }

  let urlRevoked = false
  const revokePopupUrl = () => {
    if (urlRevoked) return
    urlRevoked = true
    try {
      URL.revokeObjectURL(popupUrl)
    } catch {
      /* ignore */
    }
  }

  const runPrint = () => {
    try {
      if (w.closed) {
        revokePopupUrl()
        const fallbackUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
        void runIframePrint(fallbackUrl, false)
        return
      }
      w.focus()
      w.print()
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[establishmentPrint] print() error:", e)
      revokePopupUrl()
      const fallbackUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
      void runIframePrint(fallbackUrl, false)
    }
  }

  const cleanup = () => {
    revokePopupUrl()
    try {
      w.close()
    } catch {
      /* ignore */
    }
    w.removeEventListener("afterprint", onAfterPrint)
    w.removeEventListener("pagehide", onPageHide)
  }

  const onAfterPrint = () => cleanup()

  const onPageHide = () => {
    revokePopupUrl()
    w.removeEventListener("pagehide", onPageHide)
  }

  w.addEventListener("afterprint", onAfterPrint)
  w.addEventListener("pagehide", onPageHide, { once: true })

  const schedulePrint = () => window.setTimeout(runPrint, delayAfterLoadPopup)

  window.setTimeout(() => {
    if (w.closed) {
      revokePopupUrl()
      const fallbackUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
      void runIframePrint(fallbackUrl, false)
      return
    }
    if (w.document.readyState === "complete") {
      schedulePrint()
    } else {
      w.addEventListener("load", schedulePrint, { once: true })
    }
  }, openDelayMs)

  if (import.meta.env.DEV) {
    console.log("[establishmentPrint] opened blob document, waiting for load/print")
  }

  return true
}
