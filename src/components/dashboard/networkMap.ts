// Loaded on demand by WarehouseNetworkMap: MapLibre is large, the dashboard should not wait for it.
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSourceSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

export type NetworkNode = {
  id: number;
  code: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
  qty: number;
  skus: number;
  bins: number;
  bins_used: number;
  open_orders: number;
};
export type NetworkFlow = { from_id: number; to_id: number; in_transit: number; in_transit_qty: number; received_30d: number };
export type NetworkText = {
  nodeLines: (w: NetworkNode) => string[];
  flowLines: (f: NetworkFlow, from: NetworkNode, to: NetworkNode) => string[];
};

// OpenFreeMap: free vector tiles, no key, no request cap; needs tiles.openfreemap.org in CSP connect-src.
const STYLE = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
const isDark = () => document.documentElement.classList.contains("dark");
const token = (name: string) =>
  `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).join(", ")})`;

function lines(title: string, rows: string[]) {
  const box = document.createElement("div");
  box.className = "text-xs leading-relaxed text-zinc-900";
  const head = document.createElement("p");
  head.className = "font-semibold";
  head.textContent = title;
  box.append(head, ...rows.map((r) => Object.assign(document.createElement("p"), { textContent: r })));
  return box;
}

export function mountNetworkMap(el: HTMLElement, nodes: NetworkNode[], flows: NetworkFlow[], text: NetworkText) {
  const map = new MapLibre({ container: el, style: STYLE(isDark()), center: [117, -2], zoom: 4, scrollZoom: false, attributionControl: { compact: true } });
  map.addControl(new NavigationControl({ showCompass: false }), "top-left");
  // Compact attribution starts expanded until the first drag; start it collapsed (the (i) button opens it).
  const collapseAttrib = () => {
    const box = el.querySelector(".maplibregl-compact-show");
    if (!box) return;
    box.classList.remove("maplibregl-compact-show");
    map.off("styledata", collapseAttrib);
    map.off("sourcedata", collapseAttrib);
  };
  map.on("styledata", collapseAttrib);
  map.on("sourcedata", collapseAttrib);

  const byId = new Map(nodes.map((w) => [w.id, w]));
  const pairs = flows.flatMap((f) => {
    const a = byId.get(f.from_id);
    const b = byId.get(f.to_id);
    return a && b ? [{ f, a, b }] : [];
  });
  const data: GeoJSONSourceSpecification["data"] = {
    type: "FeatureCollection",
    features: pairs.map(({ f, a, b }, i) => ({
      type: "Feature",
      id: i,
      properties: { moving: f.in_transit > 0, width: 3 + Math.min(5, f.in_transit + f.received_30d) },
      geometry: { type: "LineString", coordinates: [[a.lng!, a.lat!], [b.lng!, b.lat!]] },
    })),
  };

  // setStyle drops our layers, so they are added on every style load (first load and theme switches).
  map.on("style.load", () => {
    map.addSource("flows", { type: "geojson", data });
    const base = { type: "line" as const, source: "flows", layout: { "line-cap": "round" as const } };
    map.addLayer({ ...base, id: "flows-done", filter: ["!", ["get", "moving"]], paint: { "line-color": token("--primary"), "line-width": ["get", "width"], "line-opacity": 0.8 } });
    map.addLayer({
      ...base,
      id: "flows-moving",
      filter: ["get", "moving"],
      layout: { "line-cap": "butt" },
      paint: { "line-color": token("--amber"), "line-width": ["get", "width"], "line-dasharray": [2, 1.5] },
    });
  });

  const hover = new Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  for (const id of ["flows-done", "flows-moving"]) {
    map.on("mousemove", id, (e) => {
      const p = pairs[Number(e.features?.[0]?.id)];
      if (!p) return;
      map.getCanvas().style.cursor = "pointer";
      hover.setLngLat(e.lngLat).setDOMContent(lines(`${p.a.code} → ${p.b.code}`, text.flowLines(p.f, p.a, p.b))).addTo(map);
    });
    map.on("mouseleave", id, () => {
      map.getCanvas().style.cursor = "";
      hover.remove();
    });
  }

  const markers = new Map<number, Marker>();
  const maxQty = Math.max(1, ...nodes.map((w) => Number(w.qty)));
  for (const w of nodes) {
    const size = Math.round(16 + 28 * Math.sqrt(Number(w.qty) / maxQty));
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", w.name);
    // Main warehouses are solid, stores and transit points hollow (see the legend).
    dot.className = `relative grid place-items-center rounded-full border-2 border-primary shadow-sm ${w.type === "main" ? "bg-primary/40" : "bg-card"}`;
    dot.style.width = dot.style.height = `${size}px`;
    if (!w.is_active) dot.style.opacity = "0.4";
    const label = Object.assign(document.createElement("span"), { textContent: w.code });
    label.className = "absolute bottom-full mb-1 rounded bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow";
    dot.append(label);
    const marker = new Marker({ element: dot })
      .setLngLat([w.lng!, w.lat!])
      .setPopup(new Popup({ offset: size / 2 + 4 }).setDOMContent(lines(w.name, [w.address ?? "", ...text.nodeLines(w)].filter(Boolean))))
      .addTo(map);
    markers.set(w.id, marker);
  }

  // Opens on the whole country (Sabang to Merauke), widened for any pin outside it.
  const bounds = new LngLatBounds([94.9, -11.1], [141.1, 6.1]);
  nodes.forEach((w) => bounds.extend([w.lng!, w.lat!]));
  map.fitBounds(bounds, { padding: 16, animate: false });

  const theme = new MutationObserver(() => map.setStyle(STYLE(isDark())));
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return {
    destroy: () => {
      theme.disconnect();
      map.remove();
    },
    /** Flies to a warehouse and opens its popup (the list beside the map). */
    focus: (id: number) => {
      const m = markers.get(id);
      if (!m) return;
      markers.forEach((o) => o.getPopup()?.isOpen() && o.togglePopup());
      map.flyTo({ center: m.getLngLat(), zoom: 10 });
      map.once("moveend", () => m.getPopup()?.isOpen() || m.togglePopup());
    },
  };
}
