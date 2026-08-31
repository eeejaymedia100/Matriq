import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { AiCompanionScreen } from "../screens/ai/AiCompanionScreen";
import { AiHistoryScreen } from "../screens/ai/AiHistoryScreen";
import { FocusModeScreen } from "../screens/ai/FocusModeScreen";
import { NotificationFeedScreen } from "../screens/notifications/NotificationFeedScreen";
import { QuizScreen } from "../screens/study/QuizScreen";
import { ReferralsScreen } from "../screens/referrals/ReferralsScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { VerificationUploadScreen } from "../screens/verification/VerificationUploadScreen";
import { VerificationStatusScreen } from "../screens/verification/VerificationStatusScreen";
import { CgpaCalculatorScreen } from "../screens/tools/CgpaCalculatorScreen";
import { OcrScreen } from "../screens/tools/OcrScreen";
import { NotesScreen } from "../screens/notes/NotesScreen";
import { NoteEditorScreen } from "../screens/notes/NoteEditorScreen";
import { DocumentReaderScreen } from "../screens/vault/DocumentReaderScreen";
import { ImageToPdfScreen } from "../screens/tools/ImageToPdfScreen";
import { VaultUploadScreen } from "../screens/vault/VaultUploadScreen";
import { TimetableScreen } from "../screens/study/TimetableScreen";
import { MyMaterialsScreen } from "../screens/study/MyMaterialsScreen";
import { FocusTimerScreen } from "../screens/study/FocusTimerScreen";
import { DeadlineTrackerScreen } from "../screens/study/DeadlineTrackerScreen";
import { PasscodeSetupScreen } from "../screens/auth/PasscodeSetupScreen";
import { PasscodeUnlockScreen } from "../screens/auth/PasscodeUnlockScreen";
import { hasPasscode, shouldRequirePasscode, markLastExit, markUnlocked, watchSessionExit } from "../utils/passcode";

// Academic Library (Netflix-for-Students discovery)
import { LibraryScreen } from "../screens/library/LibraryScreen";
import { LibrarySearchScreen } from "../screens/library/LibrarySearchScreen";
import { LibrarySavedScreen } from "../screens/library/LibrarySavedScreen";
import { LibraryDetailScreen } from "../screens/library/LibraryDetailScreen";

import { LiquidTabBar } from "./LiquidTabBar";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// ── Auth navigator ─────────────────────────────────────────────

function AuthNavigator({
  initialRoute,
}: {
  // First-ever visitors start on onboarding (spec §4); anyone who has seen
  // it before goes straight to Welcome.
  initialRoute: "Onboarding" | "Welcome";
}) {
  const { theme } = useTheme();
  return (
    <AuthStack.Navigator
      initialRouteName={initialRoute}
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
      <MainStack.Screen name="AiChat" component={AiCompanionScreen} options={{ title: "AI Study Companion" }} />
      <MainStack.Screen name="AiFocus" component={FocusModeScreen} options={{ title: "Focus Mode" }} />
      <MainStack.Screen name="AiHistory" component={AiHistoryScreen} options={{ title: "Chat history" }} />
      <MainStack.Screen name="Notifications" component={NotificationFeedScreen} options={{ title: "Notifications" }} />
      <MainStack.Screen name="Quiz" component={QuizScreen} options={{ title: "Quiz" }} />
      <MainStack.Screen name="CgpaCalculator" component={CgpaCalculatorScreen} options={{ title: "CGPA" }} />
      <MainStack.Screen name="Ocr" component={OcrScreen} options={{ title: "Image to Text" }} />
      <MainStack.Screen name="Notes" component={NotesScreen} options={{ title: "Notes" }} />
      <MainStack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ title: "Note" }} />
      <MainStack.Screen name="DocumentReader" component={DocumentReaderScreen} options={{ title: "Read" }} />
      <MainStack.Screen name="ImageToPdf" component={ImageToPdfScreen} options={{ title: "Image to PDF" }} />
      <MainStack.Screen name="VaultUpload" component={VaultUploadScreen} options={{ title: "Add to the Vault" }} />
      <MainStack.Screen name="Timetable" component={TimetableScreen} options={{ title: "Timetable" }} />
      <MainStack.Screen name="MyMaterials" component={MyMaterialsScreen} options={{ title: "My Materials" }} />
      <MainStack.Screen name="FocusTimer" component={FocusTimerScreen} options={{ title: "Focus Timer" }} />
      <MainStack.Screen name="DeadlineTracker" component={DeadlineTrackerScreen} options={{ title: "Deadlines" }} />
      <MainStack.Screen name="Library" component={LibraryScreen} options={{ title: "Academic Library" }} />
      <MainStack.Screen name="LibrarySearch" component={LibrarySearchScreen} options={{ title: "Search the Library" }} />
      <MainStack.Screen name="LibrarySaved" component={LibrarySavedScreen} options={{ title: "Saved" }} />
      <MainStack.Screen name="LibraryDetail" component={LibraryDetailScreen} options={{ title: "Document" }} />
    </MainStack.Navigator>
  );
}

// ── Session gate (spec §5) ─────────────────────────────────────
// Authenticated users never see the sign-in screen again — the passcode IS
// the only re-authentication, and it never needs the internet (it's stored
// on the device). Instead:
//  - no passcode yet → mandatory PasscodeSetup (spec §4)
//  - every cold start (app launched from scratch) → "Welcome back"
//    PasscodeUnlock, regardless of how long ago — no sign-in screen, no
//    network required
//  - only a quick background → foreground switch within the 3h grace period
//    skips the prompt (see shouldRequirePasscode)
//  - otherwise → straight to the main app
function SessionGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"loading" | "setup" | "locked" | "open">(
    "loading",
  );
  // The very first evaluate is a cold start → always lock (if a passcode
  // exists). Only later foreground returns get the 3h grace.
  const coldStartRef = useRef(true);

  const evaluate = useCallback(async () => {
    const coldStart = coldStartRef.current;
    coldStartRef.current = false;

    if (!(await hasPasscode())) {
      setPhase("setup");
      return;
    }
    // Cold start: always require the passcode. Foreground return: only after
    // the grace period (shouldRequirePasscode checks the 3h window).
    if (coldStart || (await shouldRequirePasscode())) {
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

export function AppNavigator({
  onFirstContent,
}: {
  /** Fired once the first real screen (not a loading state) is about to render. */
  onFirstContent?: () => void;
}) {
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

  // True once a REAL screen (not a loading gate) is about to render — the
  // splash overlay fades out only after this. Mirrors the render branches
  // below exactly: authenticated → SessionGate, no theme choice yet →
  // ThemePickerScreen, otherwise → AuthNavigator. The ThemePicker IS real
  // first content, so it must NOT be gated on hasThemeChoice (that was the
  // stuck-splash bug on fresh installs — contentReady stayed false forever
  // and onFirstContent never fired).
  const contentReady =
    fontsReady &&
    !isLoading &&
    (isAuthenticated || (hydrated && showOnboarding !== null));

  const notified = useRef(false);
  useEffect(() => {
    if (contentReady && !notified.current) {
      notified.current = true;
      onFirstContent?.();
    }
  }, [contentReady, onFirstContent]);

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

  return <AuthNavigator initialRoute={showOnboarding ? "Onboarding" : "Welcome"} />;
}
