import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useTheme } from "../../theme/ThemeContext";
import { Icon } from "../../components";

/**
 * Association & Admin dashboards — the real web consoles, embedded.
 *
 * Gating is layered:
 *  1. The entry points in Settings only render for executives (the app's
 *     own role check) — a student profile never sees them.
 *  2. Each console still requires its own sign-in (association email +
 *     MFA, or admin credentials) inside the WebView — cookies are handled
 *     by the sites themselves.
 *
 * A student who somehow reaches this screen sees only a sign-in page they
 * cannot pass; an executive sees their working console.
 */

const ASSOCIATION_DASHBOARD_URL = "https://dashboard.matriq.com.ng";
const ADMIN_CONSOLE_URL = "https://admin.matriq.com.ng";

export type DashboardKind = "association" | "admin";

interface DashboardWebViewScreenProps {
  route: { name: string };
}

export function DashboardWebViewScreen({ route }: DashboardWebViewScreenProps) {
  // Registered under two stack names — the name IS the configuration.
  const kind = route.name === "AdminConsole" ? "admin" : "association";
  const { theme } = useTheme();
  const { colors } = theme;
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0);

  const title = kind === "admin" ? "Admin console" : "Association dashboard";
  const url = kind === "admin" ? ADMIN_CONSOLE_URL : ASSOCIATION_DASHBOARD_URL;

  const reload = useCallback(() => {
    setError(false);
    setLoading(true);
    setKey((k) => k + 1);
  }, []);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Quiet header — title on the left, reload when needed */}
      <View
        style={{
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <Text
          style={[
            theme.typography.bodyBold,
            { color: colors.textPrimary, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {error ? (
          <Pressable
            onPress={reload}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Reload"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Icon name="refresh" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {loading && !error ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              paddingTop: 12,
              zIndex: 1,
            }}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
        {error ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 32,
              gap: 12,
            }}
          >
            <Text
              style={[theme.typography.bodyBold, { color: colors.textPrimary }]}
            >
              Couldn't load the {kind === "admin" ? "console" : "dashboard"}
            </Text>
            <Text
              style={[
                theme.typography.caption,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              Check your connection, then try again.
            </Text>
            <Pressable
              onPress={reload}
              accessibilityRole="button"
              style={{
                marginTop: 8,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: colors.accent,
              }}
            >
              <Text style={{ color: "#0A0A0A", fontWeight: "700" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={key}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: colors.bg, width }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setError(true)}
            onHttpError={() => setError(false)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
          />
        )}
      </View>
    </SafeAreaView>
  );
}
