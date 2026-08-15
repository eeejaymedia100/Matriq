import React, { useCallback, useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { LoadingScreen } from "../components";
import { getItem } from "../utils/storage";
import type {
  AuthStackParamList,
  MainStackParamList,
  MainTabParamList,
} from "./types";

// Auth screens
import {
  OnboardingScreen,
  ONBOARDING_SEEN_KEY,
} from "../screens/auth/OnboardingScreen";
import { WelcomeScreen } from "../screens/auth/WelcomeScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterChoiceScreen } from "../screens/auth/RegisterChoiceScreen";
import { RegisterStayliteScreen } from "../screens/auth/RegisterStayliteScreen";
import { RegisterFresherScreen } from "../screens/auth/RegisterFresherScreen";
import { VerifyEmailScreen } from "../screens/auth/VerifyEmailScreen";
import { CompleteProfileScreen } from "../screens/auth/CompleteProfileScreen";
import { ThemePickerScreen } from "../screens/onboarding/ThemePickerScreen";

// Tab screens (5-tab IA: Home · Vault · Tools · Study · Settings)
import { HomeScreen } from "../screens/home/HomeScreen";
import { VaultScreen } from "../screens/vault/VaultScreen";
import { ToolsScreen } from "../screens/tools/ToolsScreen";
import { StudyScreen } from "../screens/study/StudyScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";

// Stack screens (kept from the previous IA, still reachable)
import { FeeDetailsScreen } from "../screens/fees/FeeDetailsScreen";
import { PayFeeScreen } from "../screens/payments/PayFeeScreen";
import { ReceiptScreen } from "../screens/payments/ReceiptScreen";
import { AnnouncementsScreen } from "../screens/announcements/AnnouncementsScreen";
import { EventsScreen } from "../screens/events/EventsScreen";
import { OfflineModelsScreen } from "../screens/ai/OfflineModelsScreen";
import { ReferralsScreen } from "../screens/referrals/ReferralsScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { VerificationUploadScreen } from "../screens/verification/VerificationUploadScreen";
import { VerificationStatusScreen } from "../screens/verification/VerificationStatusScreen";
import { CgpaCalculatorScreen } from "../screens/tools/CgpaCalculatorScreen";
import { OcrScreen } from "../screens/tools/OcrScreen";
import { ImageToPdfScreen } from "../screens/tools/ImageToPdfScreen";
import { FileCompressorScreen } from "../screens/tools/FileCompressorScreen";
import { PdfMergeScreen } from "../screens/tools/PdfMergeScreen";
import { PdfSplitScreen } from "../screens/tools/PdfSplitScreen";
import { PdfToWordScreen } from "../screens/tools/PdfToWordScreen";
import { WordToPdfScreen } from "../screens/tools/WordToPdfScreen";
import { PassportRemoverScreen } from "../screens/tools/PassportRemoverScreen";
import { CitationScreen } from "../screens/tools/CitationScreen";
import { VaultUploadScreen } from "../screens/vault/VaultUploadScreen";
import { TimetableScreen } from "../screens/study/TimetableScreen";
import { MyMaterialsScreen } from "../screens/study/MyMaterialsScreen";
import { FocusTimerScreen } from "../screens/study/FocusTimerScreen";
import { DeadlineTrackerScreen } from "../screens/study/DeadlineTrackerScreen";
import { PasscodeSetupScreen } from "../screens/auth/PasscodeSetupScreen";
import { PasscodeUnlockScreen } from "../screens/auth/PasscodeUnlockScreen";
import { hasPasscode, shouldRequirePasscode, markLastExit, markUnlocked, watchSessionExit } from "../utils/passcode";

import { LiquidTabBar } from "./LiquidTabBar";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// ── Auth navigator ─────────────────────────────────────────────

function AuthNavigator() {
  const { theme } = useTheme();
  return (
    <AuthStack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
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

// ── Main tab navigator (5 tabs, liquid bar) ────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LiquidTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Tools" component={ToolsScreen} />
      <Tab.Screen name="Study" component={StudyScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Main (authenticated) navigator ─────────────────────────────

function MainNavigator() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const needsDob = !!user && !user.dateOfBirth;

  return (
    <MainStack.Navigator
      initialRouteName={needsDob ? "CompleteProfile" : "Home"}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontFamily: theme.typography.h3.fontFamily,
          fontSize: theme.typography.h3.fontSize,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
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
      <MainStack.Screen name="Fees" component={FeeDetailsScreen} options={{ title: "Dues & Payments" }} />
      <MainStack.Screen name="PayFee" component={PayFeeScreen} options={{ title: "Pay Dues" }} />
      <MainStack.Screen name="Receipt" component={ReceiptScreen} options={{ title: "Receipt" }} />
      <MainStack.Screen name="Referrals" component={ReferralsScreen} options={{ title: "Referrals" }} />
      <MainStack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      <MainStack.Screen name="Explore" component={AnnouncementsScreen} options={{ title: "Explore" }} />
      <MainStack.Screen name="Events" component={EventsScreen} options={{ title: "Events" }} />
      <MainStack.Screen name="VerificationUpload" component={VerificationUploadScreen} options={{ title: "Verify Identity" }} />
      <MainStack.Screen name="VerificationStatus" component={VerificationStatusScreen} options={{ title: "Verification" }} />
      <MainStack.Screen name="OfflineModels" component={OfflineModelsScreen} options={{ title: "Offline AI" }} />
      <MainStack.Screen name="CgpaCalculator" component={CgpaCalculatorScreen} options={{ title: "CGPA" }} />
      <MainStack.Screen name="Ocr" component={OcrScreen} options={{ title: "Image to Text" }} />
      <MainStack.Screen name="ImageToPdf" component={ImageToPdfScreen} options={{ title: "Image to PDF" }} />
      <MainStack.Screen name="FileCompressor" component={FileCompressorScreen} options={{ title: "File Compressor" }} />
      <MainStack.Screen name="PdfMerge" component={PdfMergeScreen} options={{ title: "PDF Merge" }} />
      <MainStack.Screen name="PdfSplit" component={PdfSplitScreen} options={{ title: "PDF Split" }} />
      <MainStack.Screen name="PdfToWord" component={PdfToWordScreen} options={{ title: "PDF → Word" }} />
      <MainStack.Screen name="WordToPdf" component={WordToPdfScreen} options={{ title: "Word → PDF" }} />
      <MainStack.Screen name="PassportRemover" component={PassportRemoverScreen} options={{ title: "Background Remover" }} />
      <MainStack.Screen name="Citation" component={CitationScreen} options={{ title: "Citation Generator" }} />
      <MainStack.Screen name="VaultUpload" component={VaultUploadScreen} options={{ title: "Add to the Vault" }} />
      <MainStack.Screen name="Timetable" component={TimetableScreen} options={{ title: "Timetable" }} />
      <MainStack.Screen name="MyMaterials" component={MyMaterialsScreen} options={{ title: "My Materials" }} />
      <MainStack.Screen name="FocusTimer" component={FocusTimerScreen} options={{ title: "Focus Timer" }} />
      <MainStack.Screen name="DeadlineTracker" component={DeadlineTrackerScreen} options={{ title: "Deadlines" }} />
    </MainStack.Navigator>
  );
}

// ── Session gate (spec §5) ─────────────────────────────────────
// Authenticated users never see the sign-in screen again. Instead:
//  - no passcode yet → mandatory PasscodeSetup (spec §4)
//  - passcode set but 3h+ since the app was last in the foreground →
//    "Welcome back" PasscodeUnlock
//  - otherwise → straight to the main app
function SessionGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"loading" | "setup" | "locked" | "open">(
    "loading",
  );

  const evaluate = useCallback(async () => {
    if (!(await hasPasscode())) {
      setPhase("setup");
      return;
    }
    if (await shouldRequirePasscode()) {
      setPhase("locked");
      return;
    }
    setPhase("open");
  }, []);

  useEffect(() => {
    void evaluate();
    return watchSessionExit(() => {
      // App came back to the foreground: record the exit that just happened
      // and re-check whether the passcode is now required.
      void markLastExit();
      void evaluate();
    });
  }, [evaluate]);

  if (phase === "loading") {
    return <LoadingScreen message="Loading Matriq…" />;
  }
  if (phase === "setup") {
    return <PasscodeSetupScreen onDone={() => setPhase("open")} />;
  }
  if (phase === "locked") {
    return (
      <PasscodeUnlockScreen
        onUnlocked={() => {
          void markUnlocked();
          setPhase("open");
        }}
      />
    );
  }
  return <>{children}</>;
}

// ── Root navigator ─────────────────────────────────────────────

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasThemeChoice, hydrated, fontsReady } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const seen = await getItem(ONBOARDING_SEEN_KEY);
        setShowOnboarding(seen !== "1");
      } catch {
        setShowOnboarding(false);
      }
    })();
  }, []);

  if (!fontsReady || isLoading) {
    return <LoadingScreen message="Loading Matriq…" />;
  }

  // Authenticated users never need onboarding or the theme picker; they go
  // through the passcode session gate instead (spec §4–§5).
  if (isAuthenticated) {
    return (
      <SessionGate>
        <MainNavigator />
      </SessionGate>
    );
  }

  if (!hydrated) {
    return <LoadingScreen message="Loading Matriq…" />;
  }

  // First-ever open: theme picker comes before onboarding, before anything
  // else (spec §4).
  if (!hasThemeChoice) {
    return <ThemePickerScreen />;
  }

  if (showOnboarding === null) {
    return <LoadingScreen message="Loading Matriq…" />;
  }

  return <AuthNavigator />;
}
