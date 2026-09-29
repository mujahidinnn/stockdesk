import { LogoMark } from "@/components/brand/Logo";

/** Shown while a lazily loaded page chunk is still downloading. */
export function PageFallback() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex h-full min-h-[50vh] items-center justify-center"
    >
      <LogoMark animated className="h-10 text-primary" />
    </div>
  );
}
