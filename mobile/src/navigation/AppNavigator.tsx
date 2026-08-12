import React, { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";

type IoniconName = keyof typeof Ionicons.glyphMap;
import { colors, typography } from "../theme/colors";
import { useAuth } from "../contexts/AuthContext";
import { LoadingScreen } from "../components";
import type {
  AuthStackParamList,
  MainStackParamList,
  MainTabParamList,
} from "./types";

// Auth screens
import { OnboardingScreen, ONBOARDING_SEEN_KEY } from "../screens/auth/OnboardingScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterChoiceScreen } from "../screens/auth/RegisterChoiceScreen";
import { RegisterStayliteScreen } from "../screens/auth/RegisterStayliteScreen";
import { RegisterFresherScreen } from "../screens/auth/RegisterFresherScreen";
import { VerifyEmailScreen } from "../screens/auth/VerifyEmailScreen";
import { CompleteProfileScreen } from "../screens/auth/CompleteProfileScreen";

// Main screens
import { DashboardScreen } from "../screens/dashboard/DashboardScreen";
import { FeeDetailsScreen } from "../screens/fees/FeeDetailsScreen";
import { PayFeeScreen } from "../screens/payments/PayFeeScreen";
import { ReceiptScreen } from "../screens/payments/ReceiptScreen";
import { AnnouncementsScreen } from "../screens/announcements/AnnouncementsScreen";
import { EventsScreen } from "../screens/events/EventsScreen";
import { AiCompanionScreen } from "../screens/ai/AiCompanionScreen";
import { ReferralsScreen } from "../screens/referrals/ReferralsScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { VerificationUploadScreen } from "../screens/verification/VerificationUploadScreen";
import { VerificationStatusScreen } from "../screens/verification/VerificationStatusScreen";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// ── Auth navigator ─────────────────────────────────────────────

function AuthNavigator({ showOnboarding }: { showOnboarding: boolean }) {
  return (
    <AuthStack.Navigator
      initialRouteName={showOnboarding ? "Onboarding" : "Welcome"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="RegisterChoice" component={RegisterChoiceScreen} />
      <AuthStack.Screen name="RegisterStaylite" component={RegisterStayliteScreen} />
      <AuthStack.Screen name="RegisterFresher" component={RegisterFresherScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </AuthStack.Navigator>
  );
}

// ── Main tab navigator ─────────────────────────────────────────

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Dashboard: { active: "home", inactive: "home-outline" },
  Fees: { active: "wallet", inactive: "wallet-outline" },
  Announcements: { active: "megaphone", inactive: "megaphone-outline" },
  Events: { active: "calendar", inactive: "calendar-outline" },
  AI: { active: "sparkles", inactive: "sparkles-outline" },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 4,
          paddingTop: 4,
          height: 56,
        },
        tabBarLabelStyle: {
          ...typography.small,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Fees" component={FeeDetailsScreen} />
      <Tab.Screen name="Announcements" component={AnnouncementsScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="AI" component={AiCompanionScreen} />
    </Tab.Navigator>
  );
}

// ── Main (authenticated) navigator ─────────────────────────────

function MainNavigator() {
  const { user } = useAuth();
  // First-time flow: after email verification the user lands on the
  // date-of-birth step before the dashboard (required once).
  const needsDob = !!user && !user.dateOfBirth;

  return (
    <MainStack.Navigator
      initialRouteName={needsDob ? "CompleteProfile" : "Home"}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: typography.h3,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {needsDob && (
        <MainStack.Screen
          name="CompleteProfile"
          component={CompleteProfileScreen}
          options={{ headerShown: false }}
        />
      )}
      <MainStack.Screen
        name="Home"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <MainStack.Screen name="PayFee" component={PayFeeScreen} options={{ title: "Pay Dues" }} />
      <MainStack.Screen name="Receipt" component={ReceiptScreen} options={{ title: "Receipt" }} />
      <MainStack.Screen name="Referrals" component={ReferralsScreen} options={{ title: "Referrals" }} />
      <MainStack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      <MainStack.Screen name="Explore" component={AnnouncementsScreen} options={{ title: "Explore" }} />
      <MainStack.Screen name="VerificationUpload" component={VerificationUploadScreen} options={{ title: "Verify Identity" }} />
      <MainStack.Screen name="VerificationStatus" component={VerificationStatusScreen} options={{ title: "Verification" }} />
    </MainStack.Navigator>
  );
}

// ── Root navigator ─────────────────────────────────────────────

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY);
        setShowOnboarding(seen !== "1");
      } catch {
        setShowOnboarding(false);
      }
    })();
  }, []);

  if (isLoading) {
    return <LoadingScreen message="Loading Matriq..." />;
  }

  // Authenticated users never need onboarding, so don't wait on storage.
  if (isAuthenticated) {
    return <MainNavigator />;
  }

  if (showOnboarding === null) {
    return <LoadingScreen message="Loading Matriq..." />;
  }

  return <AuthNavigator showOnboarding={showOnboarding} />;
}
