import { createNavigationContainerRef } from "@react-navigation/native";
import type { MainStackParamList } from "./types";

/**
 * Module-level navigation ref so non-component code (notification taps, deep
 * links) can navigate. Attached to the NavigationContainer in App.tsx.
 */
export const navigationRef = createNavigationContainerRef<MainStackParamList>();
