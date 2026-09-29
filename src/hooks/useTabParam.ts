import { useSearchParams } from "react-router-dom";

// Active tab lives in ?tab= so a refresh keeps it. Unknown or unauthorized
// values fall back instead of rendering an empty tab.
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const setTab = (next: T) =>
    setParams(
      (p) => {
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  return [tab, setTab] as const;
}
