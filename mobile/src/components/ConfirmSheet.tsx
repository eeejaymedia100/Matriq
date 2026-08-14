import React from "react";
import { Modal, View, Text, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "./icons";

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Extra content rendered between body and actions (e.g. type-to-confirm input). */
  children?: React.ReactNode;
  onConfirm?: () => void;
  onClose: () => void;
}

/**
 * Themed confirm sheet — used everywhere Alert.alert would be, because the
 * web build (for iOS users) has no native Alert. Rendered as a bottom sheet.
 */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  children,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const { theme } = useTheme();
  const colors = theme.colors;

  // react-native-web's Modal is historically quirky; the web build renders
  // the sheet as a position:fixed overlay instead, which always covers the
  // viewport. Native keeps the real Modal.
  const sheet = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={
        Platform.OS === "web"
          ? ({ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 1000 } as never)
          : { flex: 1, justifyContent: "flex-end" }
      }
    >
      <Pressable
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as never,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.overlay,
        }}
        onPress={onClose}
      />
        <View
          style={{
            backgroundColor: theme.mode === "glass" ? "rgba(30,12,48,0.96)" : colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            paddingBottom: 32,
            borderWidth: theme.mode === "glass" ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: 16,
            }}
          />
          <Text style={[theme.typography.h2, { color: colors.textPrimary }]}>{title}</Text>
          <Text
            style={[
              theme.typography.body,
              { color: colors.textSecondary, marginTop: 8, lineHeight: 24 },
            ]}
          >
            {body}
          </Text>
          {children}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 14,
                borderRadius: theme.radii.md,
                borderWidth: 1.5,
                borderColor: colors.borderStrong,
              }}
            >
              <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{
                flex: 1.4,
                alignItems: "center",
                paddingVertical: 14,
                borderRadius: theme.radii.md,
                backgroundColor: destructive ? colors.error : colors.accent,
                ...(theme.mode === "pop"
                  ? { borderWidth: 2, borderColor: colors.borderStrong, boxShadow: "3px 3px 0 #170B26" }
                  : {}),
              }}
            >
              <Text
                style={[
                  theme.typography.bodyBold,
                  { color: destructive ? "#FFFFFF" : "#170B26" },
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
  );

  if (Platform.OS === "web") {
    return visible ? sheet : null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}
