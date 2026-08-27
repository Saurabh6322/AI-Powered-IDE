/**
 * ThemeContext — manages the active theme (dark | light | custom).
 *
 * - Default is "dark" (Antigravity IDE style).
 * - Persists the user's choice in localStorage.
 * - Applies the theme class to document.documentElement (<html>).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type ThemeName = "dark" | "light" | "custom";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const STORAGE_KEY = "antigravity-ide-theme";

const ThemeCtx = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

function getInitialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "custom") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark"; // Default: Antigravity dark
}

function applyThemeClass(theme: ThemeName) {
  const root = document.documentElement;
  root.classList.remove("theme-dark", "theme-light", "theme-custom");
  root.classList.add(`theme-${theme}`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(getInitialTheme);

  // Apply theme class on mount and change
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
