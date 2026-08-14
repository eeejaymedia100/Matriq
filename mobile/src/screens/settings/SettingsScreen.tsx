import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import Constants from "expo-constants";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeMode } from "../../theme/themes";
import { ThemedScreen } from "../../components/Surface";
import { Icon, type IconName } from "../../components/icons";
import { ThemeTransitionOverlay } from "../../components/ThemeTransitionOverlay";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import { useAuth } from "../../contexts/AuthContext";
import { useOfflineAi } from "../../offline/OfflineAiContext";
import { TERMS_URL, PRIVACY_URL } from "../../constants/legal";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Settings">;

interface Row {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  onPress: () => void;
}

export function SettingsScreen({ navigation }: Props) {
  const { theme, mode, setMode } = useTheme();
  const colors = theme.colors;
  const { logout } = useAuth();
  const { downloaded } = useOfflineAi();

  const [themeFx, setThemeFx] = useState<ThemeMode | null>(null);
  const [confirm, setConfirm] = useState<null | "signout" | "delete">(null);
  const [deleteNotice, setDeleteNotice] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;
  const go = (s: string) => stackNav?.navigate(s);

  const startThemeSwitch = () => {
    if (themeFx) return;
    setThemeFx(mode === "glass" ? "pop" : "glass");
  };

  const finishThemeSwitch = () => {
    const next = themeFx;
    setThemeFx(null);
    if (next) void setMode(next);
  };

  const handleSignOut = async () => {
    setConfirm(null);
    await logout();
  };

  const handleDelete = () => {
    // Genuine type-to-confirm (spec §10) — no-op unless the phrase matches.
    if (deleteText !== "DELETE") return;
    setConfirm(null);
    setDeleteText("");
    // The 6-month scheduled deletion is wired end-to-end in the next stage;
    // until then surface a structured, honest message (spec §12 — what /
    // why / what to do, never a raw error).
    setDeleteNotice(true);
  };

  const version = Constants.expoConfig?.version ?? "0.4.0";

  const rows: Row[] = [
    {
      id: "profile",
      label: "Profile",
      hint: "Name, faculty, level, photo",
      icon: "user",
      onPress: () => go("Profile"),
    },
    {
      id: "dues",
      label: "Dues & Payments",
      hint: "Payments, receipts & history — never on Home",
      icon: "wallet",
      onPress: () => go("Fees"),
    },
    {
      id: "notifications",
      label: "Notifications",
      hint: "Alerts for announcements & deadlines",
      icon: "bell",
      onPress: () => {},
    },
    {
      id: "data",
      label: "Data & Offline",
      hint:
        Object.keys(downloaded).length > 0
          ? `${Object.keys(downloaded).length} offline model${Object.keys(downloaded).length === 1 ? "" : "s"} installed`
          : "Download the offline AI model",
      icon: "cloudOff",
      onPress: () => go("OfflineModels"),
    },
    {
      id: "verification",
      label: "Verification",
      hint: "Identity & matric status",
      icon: "shield",
      onPress: () => go("VerificationStatus"),
    },
    {
      id: "legal",
      label: "Terms of Use & Privacy",
      hint: "Read the fine print",
      icon: "fileText",
      onPress: () => Linking.openURL(TERMS_URL).catch(() => {}),
    },
    {
      id: "help",
      label: "Help & About",
      hint: `Matriq v${version} · contact support`,
      icon: "info",
      onPress: () => {},
    },
  ];

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Settings</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Make Matriq yours.
          </Text>

          {/* 1 — Appearance */}
          <Pressable onPress={startThemeSwitch}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 18,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 20,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={mode === "glass" ? "moon" : "sun"} size={21} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  Appearance
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  Currently {mode === "glass" ? "Glass — dark & frosted" : "Pop — light & clay"}
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={[theme.typography.small, { color: colors.textPrimary, fontWeight: "700" }]}>
                  Switch to {mode === "glass" ? "Pop" : "Glass"}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Rows */}
          <View style={{ marginTop: 20 }}>
            {rows.map((row, i) => (
              <Pressable key={row.id} onPress={row.onPress}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 15,
                    paddingHorizontal: 4,
                    borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Icon name={row.icon} size={20} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary }]}>
                      {row.label}
                    </Text>
                    {row.hint ? (
                      <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 1 }]}>
                        {row.hint}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="chevronRight" size={17} color={colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>

          {/* Sign out */}
          <View style={{ marginTop: 24, gap: 10 }}>
            <Pressable onPress={() => setConfirm("signout")}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  paddingVertical: 15,
                  borderRadius: theme.radii.md,
                  borderWidth: 1.5,
                  borderColor: colors.borderStrong,
                }}
              >
                <Icon name="logout" size={18} color={colors.textPrimary} />
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  Sign Out
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => setConfirm("delete")}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  paddingVertical: 15,
                  borderRadius: theme.radii.md,
                }}
              >
                <Icon name="trash" size={18} color={colors.error} />
                <Text style={[theme.typography.bodyBold, { color: colors.error }]}>
                  Delete Account
                </Text>
              </View>
            </Pressable>
          </View>

          <Text
            style={[
              theme.typography.small,
              { color: colors.textMuted, textAlign: "center", marginTop: 24, letterSpacing: 1, textTransform: "uppercase" },
            ]}
          >
            The smart way.
          </Text>
        </ScrollView>
      </SafeAreaView>

      {/* Theme transition sequence */}
      {themeFx ? <ThemeTransitionOverlay to={themeFx} onComplete={finishThemeSwitch} /> : null}

      {/* Sign out sheet */}
      <ConfirmSheet
        visible={confirm === "signout"}
        title="Sign out?"
        body="You can sign back in anytime with your email and password."
        confirmLabel="Sign Out"
        onConfirm={handleSignOut}
        onClose={() => setConfirm(null)}
      />

      {/* Delete account sheet — 6-month scheduled hard delete, type-to-confirm */}
      {/* Delete notice — structured what/why/what-to-do until the backend flow lands */}
      <ConfirmSheet
        visible={deleteNotice}
        title="Not ready yet"
        body="Account deletion isn't available in this build yet. Your account is safe and untouched."
        confirmLabel="OK"
        onConfirm={() => setDeleteNotice(false)}
        onClose={() => setDeleteNotice(false)}
      />

      <ConfirmSheet
        visible={confirm === "delete"}
        title="Delete your account?"
        body="Deleting is permanent — but not immediate. Your account is scheduled for deletion 6 months from now. If you sign back in any time before then, the deletion is cancelled and your account is restored exactly as it was. After 6 months with no sign-in, the account is hard-deleted and can't be recovered."
        confirmLabel={deleteText === "DELETE" ? "Schedule Deletion" : "Type DELETE to continue"}
        destructive
        onConfirm={deleteText === "DELETE" ? handleDelete : undefined}
        onClose={() => {
          setConfirm(null);
          setDeleteText("");
        }}
      >
        <View style={{ marginTop: 16 }}>
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 6 }]}>
            Type DELETE to confirm
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: deleteText === "DELETE" ? colors.error : colors.border,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              value={deleteText}
              onChangeText={(t) => setDeleteText(t.toUpperCase().slice(0, 6))}
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={{
                flex: 1,
                fontFamily: theme.typography.body.fontFamily,
                fontSize: 16,
                color: colors.textPrimary,
                paddingVertical: 13,
              }}
            />
          </View>
        </View>
      </ConfirmSheet>
    </ThemedScreen>
  );
}
