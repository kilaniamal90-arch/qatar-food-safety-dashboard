/** Bumps revision when persisted import data changes so dashboards can memoize safely. */

let version = 0
const listeners = new Set<() => void>()

export function subscribeDataset(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getDatasetVersionSnap() {
  return version
}

export function bumpDatasetVersion() {
  version += 1
  for (const l of listeners) l()
}
