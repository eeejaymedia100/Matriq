import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthProvider } from "./src/contexts/AuthContext";
import { NotificationsProvider } from "./src/contexts/NotificationsContext";
import { OfflineAiProvider } from "./src/offline/OfflineAiContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { UpdateOverlay } from "./src/components/UpdateOverlay";
import { AnimatedSplashScreen } from "./src/components/AnimatedSplashScreen";

// Keep the native launch screen up until the JS splash overlay is on screen —
// both are #121212 with the same centered logo, so the handoff is invisible.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Reads the active theme so the nav container + status bar follow it. */
function AppInner() {
  const { theme, isGlass, fontsReady } = useTheme();

  const [splashVisible, setSplashVisible] = useState(true);
  const [firstContentReady, setFirstContentReady] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [forceHide, setForceHide] = useState(false);

  // Hand the native launch screen off to the JS overlay the moment the overlay
  // has rendered (same pixels → no flash). Fonts/auth may still be loading
  // behind it — the overlay covers that until the first real screen mounts.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // HARD FAILSAFE: no matter what (a gate never resolving, an animation
  // callback that never fires), the splash overlay is force-unmounted after
  // 4s so the user can never be trapped on the splash screen. The app behind
  // it is always rendering real content or a spinner by then.
  useEffect(() => {
    const t = setTimeout(() => setForceHide(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Keep the brand splash up for a minimum beat even on instant cold starts.
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 800);
    return () => clearTimeout(t);
  }, []);

  const handleFirstContent = useCallback(() => setFirstContentReady(true), []);
  const handleSplashDone = useCallback(() => setSplashVisible(false), []);

  const navTheme = {
    ...(isGlass ? DarkTheme : DefaultTheme),
    colors: {
      ...(isGlass ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.colors.bg,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      primary: theme.colors.accent,
      notification: theme.colors.accent,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <AuthProvider>
        <OfflineAiProvider>
          <NotificationsProvider>
            <NavigationContainer theme={navTheme}>
              {/* Splash overlay is dark, so force light status-bar icons over it. */}
              <StatusBar
                style={splashVisible ? "light" : isGlass ? "light" : "dark"}
              />
              <NavigationBar style={isGlass ? "light" : "dark"} />
              <AppNavigator onFirstContent={handleFirstContent} />
              <UpdateOverlay />
            </NavigationContainer>
          </NotificationsProvider>
        </OfflineAiProvider>
      </AuthProvider>

      {splashVisible && !forceHide && (
        <AnimatedSplashScreen
          ready={fontsReady && firstContentReady && minSplashElapsed}
          onDone={handleSplashDone}
        />
      )}
    </View>
  );
}
