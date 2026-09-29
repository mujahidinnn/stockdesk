import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
export const qtyText = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
