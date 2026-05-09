import { useSyncExternalStore } from "react"

import { getDatasetVersionSnap, subscribeDataset } from "@/data/datasetVersion"

export function useDatasetVersion() {
  return useSyncExternalStore(subscribeDataset, getDatasetVersionSnap, getDatasetVersionSnap)
}
