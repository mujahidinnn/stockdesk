// Reference copy of the costing in post_stock_movement(); the database is the
// source of truth. Rounding matches the columns: unit cost numeric(18,4),
// money numeric(18,2), quantity numeric(14,3).

export interface CostLayer {
  qty: number;
  unitCost: number;
}

// Postgres numeric is exact and rounds half away from zero. toPrecision(15)
// drops float noise (…4999999 becomes …5) before rounding the same way.
const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  // + 0 turns -0 into 0.
  return (Math.sign(n) * Math.round(Number((Math.abs(n) * f).toPrecision(15)))) / f + 0;
};
export const money = (n: number) => round(n, 2);
export const unitCost = (n: number) => round(n, 4);
const qty3 = (n: number) => round(n, 3);

/** Takes `qty` from the oldest layers first. Throws when the layers hold less than asked. */
export function consumeFifo(layers: CostLayer[], qty: number) {
  let rest = qty3(qty);
  let cogs = 0;
  const remainingLayers: CostLayer[] = [];
  for (const l of layers) {
    const take = Math.min(rest, l.qty);
    cogs += take * l.unitCost;
    rest = qty3(rest - take);
    if (l.qty - take > 0) remainingLayers.push({ qty: qty3(l.qty - take), unitCost: l.unitCost });
  }
  if (rest > 0) throw new Error(`Not enough stock: short by ${rest}`);
  return { cogs: money(cogs), remainingLayers };
}

export function movingAverage(prevQty: number, prevAvg: number, inQty: number, inCost: number) {
  const total = prevQty + inQty;
  return total > 0 ? unitCost((prevQty * prevAvg + inQty * inCost) / total) : 0;
}

export function valueOnHand(stock: CostLayer[] | { qty: number; avgCost: number }) {
  if (Array.isArray(stock)) return money(stock.reduce((s, l) => s + l.qty * l.unitCost, 0));
  return money(stock.qty * stock.avgCost);
}

export type CostMove = { kind: "in"; qty: number; unitCost: number } | { kind: "out"; qty: number };

/** Replays in/out movements for one SKU and returns COGS per outbound plus the closing value, both methods. */
export function replayCosting(moves: CostMove[]) {
  let layers: CostLayer[] = [];
  let avg = 0;
  const cogs: { fifo: number; average: number }[] = [];
  for (const m of moves) {
    const onHand = layers.reduce((s, l) => s + l.qty, 0);
    if (m.kind === "in") {
      avg = movingAverage(onHand, avg, m.qty, m.unitCost);
      layers.push({ qty: m.qty, unitCost: m.unitCost });
    } else {
      const r = consumeFifo(layers, m.qty);
      cogs.push({ fifo: r.cogs, average: money(m.qty * avg) });
      layers = r.remainingLayers;
      if (!layers.length) avg = 0;
    }
  }
  const qty = qty3(layers.reduce((s, l) => s + l.qty, 0));
  return { cogs, qty, avgCost: avg, value: { fifo: valueOnHand(layers), average: valueOnHand({ qty, avgCost: avg }) } };
}

/**
 * A cost correction on a receipt layer after part of it has left: the part
 * still on hand is revalued, the part already issued becomes a COGS adjustment.
 */
export function revaluationSplit(layer: { qtyIn: number; qtyRemaining: number; unitCost: number }, newCost: number) {
  const diff = newCost - layer.unitCost;
  return {
    onHand: money(layer.qtyRemaining * diff),
    cogs: money((layer.qtyIn - layer.qtyRemaining) * diff),
  };
}
