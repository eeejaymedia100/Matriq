import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { API_BASE, authHeaders } from "../api/client";

/**
 * Circular profile avatar. Renders the uploaded photo when one exists
 * (data-URI directly, API path with the auth header attached), otherwise
 * falls back to the user's initial on the brand background — matching the
 * header avatars on Home, Profile and Dashboard.
 */
export function ProfileAvatar({
  url,
  name,
  size = 46,
}: {
  url: string | null | undefined;
  name?: string | null;
  size?: number;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let mounted = true;
    if (url && !url.startsWith("data:")) {
      void authHeaders().then((h) => {
        if (mounted && h) setHeaders(h);
      });
    }
    return () => {
      mounted = false;
    };
  }, [url]);

  const initial = (name?.trim().charAt(0) ?? "S").toUpperCase();
  // API paths are relative to the base — e.g. "/me/photo" → "{API_BASE}/me/photo".
  const uri = url && url.startsWith("/") ? `${API_BASE}${url}` : url;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: colors.brand,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image
          source={
            uri.startsWith("data:")
              ? { uri }
              : { uri, headers: headers ?? {} }
          }
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.initial,
            { fontSize: size * 0.42, lineHeight: size * 0.52 },
          ]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  initial: {
    fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF",
  },
});
