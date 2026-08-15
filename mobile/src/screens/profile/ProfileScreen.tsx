import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Card, Button, Input } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { User } from "../../types/api";
import { markTodoDone } from "../../utils/todos";
import { checkTodoBadge } from "../../utils/badges";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

export function ProfileScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const { user, refreshUser, logout } = useAuth();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/me", profile);
      await refreshUser();
      setEditing(false);
      // Completing the profile counts as the "Add a profile photo" to-do
      // (spec §6) — genuine completion, not just visiting the screen.
      await markTodoDone("photo");
      await checkTodoBadge();
      Alert.alert("Success", "Profile updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const setupMfa = async () => {
    try {
      await api.post<{ qrCodeDataUrl: string }>("/auth/mfa/enroll", {});
      Alert.alert(
        "MFA Setup",
        "Scan the QR code with your authenticator app, then enter the code to verify.",
        [{ text: "OK" }],
      );
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "MFA setup failed");
    }
  };

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.fullName?.charAt(0)?.toUpperCase() ?? "S"}
              </Text>
            </View>
            <Text style={styles.name}>{user?.fullName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {user?.registrationType?.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Profile Details */}
          <Card title="Profile Information">
            {editing ? (
              <>
                <Input
                  label="Full Name"
                  value={profile.fullName ?? user?.fullName ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, fullName: v }))}
                />
                <Input
                  label="Department"
                  value={profile.department ?? user?.department ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, department: v }))}
                />
                <Input
                  label="Faculty"
                  value={profile.faculty ?? user?.faculty ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, faculty: v }))}
                />
                <Input
                  label="Level"
                  value={profile.level ?? user?.level ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, level: v }))}
                />
                <View style={styles.editBtns}>
                  <Button
                    title="Cancel"
                    onPress={() => setEditing(false)}
                    variant="ghost"
                    fullWidth={false}
                  />
                  <Button
                    title="Save"
                    onPress={handleSave}
                    loading={saving}
                    fullWidth={false}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Department</Text>
                  <Text style={styles.value}>{user?.department ?? "—"}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Faculty</Text>
                  <Text style={styles.value}>{user?.faculty ?? "—"}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Level</Text>
                  <Text style={styles.value}>{user?.level ?? "—"}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Matric Number</Text>
                  <Text style={styles.value}>{user?.matricNumber ?? "Pending"}</Text>
                </View>
                <Button
                  title="Edit Profile"
                  onPress={() => setEditing(true)}
                  variant="outline"
                  size="sm"
                />
              </>
            )}
          </Card>

          {/* Notifications */}
          <Card title="Notifications">
            <View style={styles.row}>
              <Text style={styles.label}>Push alerts</Text>
              <Text style={styles.value}>Available</Text>
            </View>
            <Text style={styles.notifHint}>
              You'll get in-app alerts for verification results, payment
              receipts, new dues and announcements — right here in Matriq, no
              extra app needed.
            </Text>
          </Card>

          {/* Security */}
          <Card title="Security">
            <View style={styles.row}>
              <Text style={styles.label}>MFA</Text>
              <Text style={styles.value}>
                {user?.mfaEnabled ? "Enabled" : "Not set up"}
              </Text>
            </View>
            {!user?.mfaEnabled && (
              <Button
                title="Set Up Two-Factor Auth"
                onPress={setupMfa}
                variant="outline"
                size="sm"
              />
            )}
          </Card>

          {/* Logout */}
          <Button title="Sign Out" onPress={logout} variant="ghost" />
          <Text style={styles.version}>Matriq v0.1.0</Text>

          <View style={{ height: theme.spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    container: { padding: theme.spacing.lg },
    avatarSection: {
      alignItems: "center",
      marginBottom: theme.spacing.lg,
      marginTop: theme.spacing.md,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 999,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.sm,
    },
    avatarText: {
      fontFamily: theme.typography.h1.fontFamily,
      fontSize: 32,
      color: "#FFFFFF",
    },
    name: {
      fontFamily: theme.typography.h2.fontFamily,
      fontSize: theme.typography.h2.fontSize,
      lineHeight: theme.typography.h2.lineHeight,
      color: colors.textPrimary,
    },
    email: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textMuted,
      marginTop: 2,
    },
    badge: {
      marginTop: theme.spacing.sm,
      backgroundColor: colors.brand + "22",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: 999,
    },
    badgeText: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.brand,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.sm,
    },
    label: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textMuted,
    },
    value: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.textPrimary,
    },
    editBtns: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    notifHint: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      lineHeight: theme.typography.caption.lineHeight,
      color: colors.textMuted,
      marginTop: theme.spacing.sm,
    },
    version: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: theme.spacing.lg,
    },
  });
}
