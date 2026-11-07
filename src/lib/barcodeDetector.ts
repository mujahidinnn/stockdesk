// Native BarcodeDetector where the browser has it (Chrome on Android, Windows, Mac); a ZXing WebAssembly
// ponyfill everywhere else (Firefox, Safari, Chrome on Linux). Both read a video frame or an image.
export interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => Detector;
  }
}
const FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_39"] as const;

let ready: Promise<Detector> | null = null;

export function getDetector(): Promise<Detector> {
  if (window.BarcodeDetector) return Promise.resolve(new window.BarcodeDetector({ formats: [...FORMATS] }));
  // Loaded on first use so the ~1 MB wasm never touches pages that do not scan.
  ready ??= Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ])
    .then(([lib, wasm]) => {
      // Serve the wasm from our own origin; the CSP does not allow the default CDN.
      lib.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasm.default : prefix + path) },
      });
      return new lib.BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
    })
    .catch((e) => {
      ready = null; // allow a retry after a network failure
      throw e;
    });
  return ready;
}
