"use client";

import { useEffect, useRef, useState } from "react";

// Flips to true the first time the element scrolls into view, then stops watching.
// The bottom margin shrinks the viewport, so an element merely peeking in at the
// bottom edge of the screen doesn't count until it's scrolled up into view.
export function useInView<T extends Element>(rootMargin = "0px 0px -25% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView] as const;
}
