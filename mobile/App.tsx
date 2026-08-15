import React from "react";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthProvider } from "./src/contexts/AuthContext";
import { OfflineAiProvider } from "./src/offline/OfflineAiContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { UpdateOverlay } from "./src/components/UpdateOverlay";
import { LoadingScreen } from "./src/components";

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

  if (!fontsReady) {
    return <LoadingScreen message="Loading Matriq…" />;
  }

  return (
    <AuthProvider>
      <OfflineAiProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style={isGlass ? "light" : "dark"} />
          <AppNavigator />
          <UpdateOverlay />
        </NavigationContainer>
      </OfflineAiProvider>
    </AuthProvider>
  );
}
