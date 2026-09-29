import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  /** Resolved theme actually applied to the document. */
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  preference: "system",
  setPreference: () => {},
  toggleTheme: () => {},
});

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem("theme");
      return saved === "dark" || saved === "light" ? saved : "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState(media.matches);

  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme: Theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("theme", preference);
    } catch {
      // Storage may be unavailable (private mode).
    }
  }, [preference]);

  const toggleTheme = () => setPreference(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider
      value={{ theme, preference, setPreference, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
