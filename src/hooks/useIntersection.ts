import { useEffect, useRef, useState } from "react"

/**
 * Fires once when the element scrolls into view (threshold met).
 * Returns `true` permanently after the first intersection.
 */
export function useIntersection(
  ref: React.RefObject<Element | null>,
  options?: IntersectionObserverInit,
): boolean {
  const [visible, setVisible] = useState(false)
  const didFire = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || didFire.current) return

    const obs = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && !didFire.current) {
        didFire.current = true
        setVisible(true)
        obs.disconnect()
      }
    }, options)

    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, options])

  return visible
}
