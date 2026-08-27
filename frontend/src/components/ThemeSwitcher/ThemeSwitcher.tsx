/**
 * ThemeSwitcher — single circular button that cycles through themes.
 *
 * Shows the current theme's accent color. Click to cycle: Dark → Light → Neon → Dark.
 */

import { useTheme, type ThemeName } from "../../contexts/ThemeContext";
import styles from "./ThemeSwitcher.module.css";

const THEME_ORDER: ThemeName[] = ["dark", "light", "custom"];
const THEME_COLORS: Record<ThemeName, string> = {
  dark: "#7c3aed",
  light: "#6d28d9",
  custom: "#bd93f9",
};
const THEME_LABELS: Record<ThemeName, string> = {
  dark: "Dark",
  light: "Light",
  custom: "Neon",
};

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    setTheme(next);
  };

  return (
    <button
      className={styles.themeBtn}
      onClick={cycleTheme}
      title={`Theme: ${THEME_LABELS[theme]} — Click to switch`}
      aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to switch.`}
    >
      <svg
        className={styles.icon}
        style={{ color: THEME_COLORS[theme] }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
      </svg>
    </button>
  );
}
