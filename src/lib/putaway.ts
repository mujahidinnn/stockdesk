// Reference copy of suggest_putaway_bins(); the SQL is the source of truth.

export interface PutawaySku {
  id: number;
  batchId: number | null;
  categoryId: number | null;
  weightKg: number;
}

export interface BinState {
  id: number;
  code: string;
  binType: string;
  isActive: boolean;
  allowedCategoryIds: number[];
  maxQty: number | null;
  maxWeightKg: number | null;
  pickSequence: number;
  usedQty: number;
  usedWeightKg: number;
  holdsSame: boolean;
}

export interface RankedBin extends BinState {
  rank: 1 | 2 | 3;
  freeQty: number | null;
}

/**
 * 1. bin already holding the same SKU and batch, with room
 * 2. empty bin whose categories fit, with room
 * 3. any other bin with room, nearest the dock (lowest pick sequence)
 * Inactive, non-storage, wrong-category and too-full bins are dropped.
 */
export function rankPutawayBins(sku: PutawaySku, qty: number, bins: BinState[], limit = 5): RankedBin[] {
  return bins
    .filter(
      (b) =>
        b.isActive &&
        (b.binType === "storage" || b.binType === "picking") &&
        (b.allowedCategoryIds.length === 0 || (sku.categoryId != null && b.allowedCategoryIds.includes(sku.categoryId))) &&
        (b.maxQty == null || b.maxQty - b.usedQty >= qty) &&
        (b.maxWeightKg == null || b.maxWeightKg - b.usedWeightKg >= qty * sku.weightKg),
    )
    .map((b): RankedBin => ({
      ...b,
      rank: b.holdsSame ? 1 : b.usedQty === 0 ? 2 : 3,
      freeQty: b.maxQty == null ? null : b.maxQty - b.usedQty,
    }))
    .sort((a, b) => a.rank - b.rank || a.pickSequence - b.pickSequence || a.code.localeCompare(b.code))
    .slice(0, limit);
}
