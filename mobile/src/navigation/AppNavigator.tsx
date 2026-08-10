import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { colors, typography } from "../theme/colors";
import { useAuth } from "../contexts/AuthContext";
import { LoadingScreen } from "../components";
import type {
  AuthStackParamList,
  MainStackParamList,
  MainTabParamList,
} from "./types";

// Auth screens
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterChoiceScreen } from "../screens/auth/RegisterChoiceScreen";
import { RegisterStayliteScreen } from "../screens/auth/RegisterStayliteScreen";
import { RegisterFresherScreen } from "../screens/auth/RegisterFresherScreen";

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

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="RegisterChoice" component={RegisterChoiceScreen} />
      <AuthStack.Screen name="RegisterStaylite" component={RegisterStayliteScreen} />
      <AuthStack.Screen name="RegisterFresher" component={RegisterFresherScreen} />
    </AuthStack.Navigator>
  );
}

// ── Main tab navigator ─────────────────────────────────────────

const TAB_ICONS: Record<string, string> = {
  Dashboard: "🏠",
  Fees: "💰",
  Announcements: "📢",
  Events: "📅",
  AI: "🤖",
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
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.6 }}>
            {TAB_ICONS[route.name] ?? "📱"}
          </Text>
        ),
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
  return (
    <MainStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: typography.h3,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
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

  if (isLoading) {
    return <LoadingScreen message="Loading Matriq..." />;
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}
