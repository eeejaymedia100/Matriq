import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { getItem, setItem } from "../utils/storage";
import { themes, type MatriqTheme, type ThemeMode } from "./themes";

export const THEME_STORAGE_KEY = "matriq_theme";

interface ThemeContextValue {
  /** Currently active mode. Defaults to Glass until the picker persists a choice. */
  mode: ThemeMode;
  theme: MatriqTheme;
  isGlass: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  /** True once the persisted choice has been read (theme picker gate). */
  hydrated: boolean;
  /** True when the user has explicitly picked a theme (first-open gate). */
  hasThemeChoice: boolean;
  /** True when Plus Jakarta Sans is ready (or failed → fallback fonts). */
  fontsReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [mode, setModeState] = useState<ThemeMode>("glass");
  const [hydrated, setHydrated] = useState(false);
  const [hasThemeChoice, setHasThemeChoice] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem(THEME_STORAGE_KEY);
        if (saved === "glass" || saved === "pop") {
          setModeState(saved);
          setHasThemeChoice(true);
        }
      } catch {
        // ignore — default theme stands
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    setHasThemeChoice(true);
    await setItem(THEME_STORAGE_KEY, next);
  }, []);

  const theme = themes[mode];

  return (
    <ThemeContext.Provider
      value={{
        mode,
        theme,
        isGlass: mode === "glass",
        setMode,
        hydrated,
        hasThemeChoice,
        fontsReady: fontsLoaded || !!fontError,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
