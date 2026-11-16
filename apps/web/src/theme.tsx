import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "./i18n";

export const THEME_STORAGE_KEY = "odf-theme";
export type ColorTheme = "light" | "dark";

export function readStoredTheme(): ColorTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ColorTheme>(() =>
    typeof document === "undefined" ? "light" : document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    window.addEventListener("storage", sync);
    window.addEventListener("odf-theme-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("odf-theme-change", sync);
    };
  }, []);

  function toggle() {
    const next: ColorTheme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    window.dispatchEvent(new Event("odf-theme-change"));
  }

  const label = theme === "dark" ? t("Switch to light theme") : t("Switch to dark theme");
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " is-compact" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      <Icon size={compact ? 17 : 18} aria-hidden="true" />
      {compact ? null : <span className="theme-toggle__label">{t("Appearance")}</span>}
    </button>
  );
}
