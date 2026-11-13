"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/lib/useInView";

const DURATION = 1400;

// Counts from 0 up to a formatted number like "1,284" once it scrolls into view.
export function CountUp({
  value,
  delay = 0,
}: {
  value: string;
  // Seconds to wait after appearing before counting starts.
  delay?: number;
}) {
  const target = Number(value.replace(/[^\d.]/g, ""));
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = requestAnimationFrame(() => setCurrent(target));
      return () => cancelAnimationFrame(frame);
    }
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const t = Math.min(1, (now - start) / DURATION);
      setCurrent(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [inView, target, delay]);

  return <span ref={ref}>{current.toLocaleString("en-US")}</span>;
}
