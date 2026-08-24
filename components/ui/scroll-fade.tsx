"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ScrollFadeProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * A scroll region that fades the edge it continues past.
 *
 * Each edge fades only when there is content that way. A constant fade would
 * dim the first heading before you have scrolled anywhere, and a fade at a
 * boundary you have already reached says nothing.
 *
 * The mask itself lives in `globals.css`, keyed off the data attributes set
 * here.
 */
export function ScrollFade({ className, children }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      setEdges({
        top: el.scrollTop > 1,
        bottom: overflow > 1 && el.scrollTop < overflow - 1,
      });
    };

    // Observing the content as well as the box: the box keeps its size while
    // the content grows, so watching only `el` would miss a section opening.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-fade-top={edges.top || undefined}
      data-fade-bottom={edges.bottom || undefined}
      className={cn("scroll-fade", className)}
    >
      {children}
    </div>
  );
}
