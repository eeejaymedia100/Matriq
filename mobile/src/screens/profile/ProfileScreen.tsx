import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Application from "expo-application";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardScreen } from "../../components/KeyboardScreen";
import { ProfileAvatar } from "../../components/ProfileAvatar";
import { Card, Button, Field } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import { optimizeImageForUpload } from "../../utils/imageOptimize";
import type { User } from "../../types/api";
import { markTodoDone } from "../../utils/todos";
import { checkTodoBadge } from "../../utils/badges";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

export function ProfileScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

  const {
    user,
    refreshUser,
    logout,
    uploadProfilePhoto,
    removeProfilePhoto,
  } = useAuth();
  const [profile, setProfile] = useState<Partial<User>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  /** Pick (library or camera), optimize, then upload the new photo. */
  const changePhoto = async (source: "library" | "camera") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          source === "camera"
            ? "Allow camera access to take a profile photo."
            : "Allow photo access to pick a profile photo.",
        );
        return;
      }
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.9,
            });
      if (res.canceled || res.assets.length === 0) return;
      const asset = res.assets[0];
      setPhotoBusy(true);
      // Compress on-device first — a raw 3000×4000 photo would blow past the
      // upload cap and waste data on a 600px avatar.
      const optimized = await optimizeImageForUpload(
        asset.uri,
        asset.fileName ?? "profile.jpg",
        { knownSize: { width: asset.width, height: asset.height } },
      );
      await uploadProfilePhoto(optimized.uri, optimized.fileName);
      // Uploading a real photo genuinely completes the "Add a profile photo"
      // to-do (spec §6), not just visiting the screen.
      await markTodoDone("photo");
      await checkTodoBadge();
      Alert.alert("Photo updated", "Your new profile picture is live.");
    } catch (err) {
      // Friendly, actionable errors — never a raw implementation detail.
      const raw =
        err instanceof Error && err.message ? err.message : "";
      const readingFailed = raw.includes("Couldn't read that file");
      Alert.alert(
        "Couldn't update photo",
        readingFailed
          ? "Matriq couldn't read the image you picked. Try a different photo, then upload again."
          : "The upload didn't go through — check your connection and try again.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await removeProfilePhoto();
      Alert.alert("Photo removed", "Your profile picture has been removed.");
    } catch (err) {
      Alert.alert(
        "Couldn't remove photo",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const promptPhoto = () => {
    const buttons: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }> = [
      {
        text: "Take a photo",
        onPress: () => void changePhoto("camera"),
      },
      {
        text: "Choose from library",
        onPress: () => void changePhoto("library"),
      },
    ];
    if (user?.profilePhotoUrl) {
      buttons.push({
        text: "Remove photo",
        style: "destructive",
        onPress: () => void removePhoto(),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile photo", "How do you want to set your photo?", buttons);
  };

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

  return (
    <KeyboardScreen
      padding={0}
      contentContainerStyle={styles.container}
      paddingBottom={40}
    >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <Pressable onPress={photoBusy ? undefined : promptPhoto}>
              <View
                style={{
                  position: "relative",
                  borderWidth: 2,
                  borderColor: colors.accent + "66",
                  borderRadius: 999,
                }}
              >
                <ProfileAvatar
                  url={user?.profilePhotoUrl ?? null}
                  name={user?.fullName}
                  size={88}
                />
                {photoBusy ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: 999,
                      backgroundColor: "rgba(10,10,10,0.55)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              onPress={promptPhoto}
              disabled={photoBusy}
              style={{ marginTop: theme.spacing.sm }}
            >
              <Text
                style={{
                  fontFamily: theme.typography.captionBold.fontFamily,
                  fontSize: theme.typography.captionBold.fontSize,
                  color: colors.brand,
                }}
              >
                {photoBusy ? "Uploading…" : "Change photo"}
              </Text>
            </Pressable>
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
                <Field
                  label="Full Name"
                  value={profile.fullName ?? user?.fullName ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, fullName: v }))}
                />
                <Field
                  label="Department"
                  value={profile.department ?? user?.department ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, department: v }))}
                />
                <Field
                  label="Faculty"
                  value={profile.faculty ?? user?.faculty ?? ""}
                  onChangeText={(v) => setProfile((p) => ({ ...p, faculty: v }))}
                />
                <Field
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
              <Text style={styles.notifHint}>
                Two-factor auth is coming to Matriq. Your account is protected
                by your device passcode and verified email for now.
              </Text>
            )}
          </Card>

          {/* Logout */}
          <Button title="Sign Out" onPress={logout} variant="ghost" />
          <Text style={styles.version}>
            Matriq v{Application.nativeApplicationVersion ?? "2.0.0"}
          </Text>
    </KeyboardScreen>
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
