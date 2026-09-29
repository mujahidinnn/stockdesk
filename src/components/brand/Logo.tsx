import { useId } from "react";
import { cn } from "@/lib/utils";

// Isometric box: outer hexagon plus the three inner edges.
const VB = "0 0 24 24";
const SHELL = "M12 2.6L20.6 7.3V16.7L12 21.4L3.4 16.7V7.3Z";
const EDGES = "M3.4 7.3L12 12L20.6 7.3M12 12V21.4";
const BAND = 3.2;
const HOLE = 1.1;

/** `solid` is for favicon sizes; `animated` keyframes live in index.html so the pre-JS splash shares them. */
export function LogoMark({
  className,
  variant = "outline",
  animated = false,
}: {
  className?: string;
  variant?: "outline" | "solid";
  animated?: boolean;
}) {
  const id = useId();
  const stroke = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const shell = animated ? { pathLength: 1, className: "logo-draw-wave" } : {};
  const edges = animated ? { pathLength: 1, className: "logo-draw-arrow" } : {};

  return (
    <svg viewBox={VB} aria-hidden="true" className={cn("h-6 w-auto", className)}>
      {variant === "outline" ? (
        <>
          <mask id={id}>
            <g {...stroke} stroke="#fff" strokeWidth={BAND}>
              <path d={SHELL} {...shell} />
              <path d={EDGES} {...edges} />
            </g>
            <g {...stroke} stroke="#000" strokeWidth={HOLE}>
              <path d={SHELL} {...shell} />
              <path d={EDGES} {...edges} />
            </g>
          </mask>
          <rect width="100%" height="100%" fill="currentColor" mask={`url(#${id})`} />
        </>
      ) : (
        <g {...stroke} stroke="currentColor" strokeWidth={BAND}>
          <path d={SHELL} {...shell} />
          <path d={EDGES} {...edges} />
        </g>
      )}
    </svg>
  );
}
