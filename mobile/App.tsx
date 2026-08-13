import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./src/contexts/AuthContext";
import { OfflineAiProvider } from "./src/offline/OfflineAiContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { UpdateOverlay } from "./src/components/UpdateOverlay";

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineAiProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <AppNavigator />
            <UpdateOverlay />
          </NavigationContainer>
        </OfflineAiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
