import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Card, Button, Input } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { User } from "../../types/api";

export function ProfileScreen() {
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
      Alert.alert("Success", "Profile updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const setupMfa = async () => {
    try {
      const data = await api.post<{ qrCodeDataUrl: string }>("/auth/mfa/enroll", {});
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
    <SafeAreaView style={styles.safe}>
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
            <Text style={styles.badgeText}>{user?.registrationType?.toUpperCase()}</Text>
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
            You'll get push alerts for verification results, payment receipts,
            new dues and announcements. To receive them on this device, subscribe
            to your personal channel in the Matriq ntfy feed (topic:
            {" "}
            <Text style={styles.notifCode}>matriq-user-{user?.id ?? "…"}</Text>)
            using the ntfy app or the web feed.
          </Text>
        </Card>

        {/* Security */}
        <Card title="Security">
          <View style={styles.row}>
            <Text style={styles.label}>MFA</Text>
            <Text style={styles.value}>
              {user?.mfaEnabled ? "Enabled ✓" : "Not set up"}
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

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  avatarSection: { alignItems: "center", marginBottom: spacing.lg, marginTop: spacing.md },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { ...typography.h1, color: colors.textOnPrimary, fontSize: 32 },
  name: { ...typography.h2, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryLight + "20",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  badgeText: { ...typography.captionBold, color: colors.primary },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.captionBold, color: colors.textPrimary },
  editBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  notifHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  notifCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    color: colors.primary,
  },
  version: { ...typography.small, color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
});
