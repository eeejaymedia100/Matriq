import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Surface } from "./Surface";
import { api } from "../api/client";

/**
 * Admin-controlled Home banner strip (UI direction §Navigation and Home).
 *
 * Deliberately minimal: a slim horizontal strip of quiet cards under the
 * Home header — NOT an advertising carousel. Students see published banners
 * in server order (schedule windows already applied). Each banner may carry
 * an optional action (label + http(s) URL). Fetch happens on Home focus with
 * a short in-memory TTL so it never blocks or spams the API.
 */

export interface Banner {
  id: string;
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let bannerCache: { banners: Banner[]; fetchedAt: number } | null = null;

export function HomeBannerStrip() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [banners, setBanners] = useState<Banner[] | null>(
    bannerCache && Date.now() - bannerCache.fetchedAt < CACHE_TTL_MS
      ? bannerCache.banners
      : null,
  );

  const load = useCallback(async () => {
    if (bannerCache && Date.now() - bannerCache.fetchedAt < CACHE_TTL_MS) {
      setBanners(bannerCache.banners);
      return;
    }
    try {
      const data = await api.get<{ banners: Banner[] }>("/banners");
      const list = (data.banners ?? []).slice(0, 5);
      bannerCache = { banners: list, fetchedAt: Date.now() };
      setBanners(list);
    } catch {
      // Banners are a nice-to-have; fail silently (offline / error).
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!banners || banners.length === 0) return null;

  return (
    <View style={{ marginTop: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
      >
        {banners.map((b) => {
          const actionable = !!b.linkUrl && !!b.linkLabel;
          const card = (
            <Surface
              variant="sticker"
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: theme.radii.md,
                maxWidth: 320,
              }}
            >
              <Text
                numberOfLines={1}
                style={[theme.typography.captionBold, { color: colors.textPrimary }]}
              >
                {b.title}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  theme.typography.small,
                  { color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
                ]}
              >
                {b.body}
                {actionable ? `  ${b.linkLabel} →` : ""}
              </Text>
            </Surface>
          );
          return actionable ? (
            <Pressable
              key={b.id}
              onPress={() => {
                if (b.linkUrl) void Linking.openURL(b.linkUrl);
              }}
              accessibilityRole="link"
              accessibilityLabel={`${b.title}: ${b.body}`}
            >
              {card}
            </Pressable>
          ) : (
            <View key={b.id} accessibilityLabel={`${b.title}: ${b.body}`}>
              {card}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}