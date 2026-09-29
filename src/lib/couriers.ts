// Courier sites are client-rendered and ignore a tracking number in the URL, so the
// link opens the tracking page and the number is copied to paste there.
export const COURIERS: { name: string; trackUrl?: string }[] = [
  { name: "JNE", trackUrl: "https://www.jne.co.id/tracking-package" },
  { name: "J&T", trackUrl: "https://jet.co.id/track" },
  { name: "SiCepat", trackUrl: "https://www.sicepat.com/" },
  { name: "AnterAja", trackUrl: "https://anteraja.id/tracking" },
  { name: "Pos Indonesia", trackUrl: "https://www.posindonesia.co.id/id/tracking" },
  { name: "Kurir internal" },
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Tracking page for a free-text courier name ("jne", "J&T Express"), or null. */
export function courierTrackUrl(courier: string | null | undefined): string | null {
  const k = key(courier ?? "");
  if (!k) return null;
  return COURIERS.find((c) => c.trackUrl && k.startsWith(key(c.name)))?.trackUrl ?? null;
}
