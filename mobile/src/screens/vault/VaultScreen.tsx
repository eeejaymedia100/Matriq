import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Vault">;

/**
 * The Vault (spec §7) — the shared, cross-student academic database. Not
 * personal storage; materials students contribute for each other, scoped by
 * course/school. This stage ships the search + browse surface; the real
 * upload/moderation flow lands with the backend work.
 */
export function VaultScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [query, setQuery] = useState("");

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Vault</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            The shared academic database — past questions and materials from
            students like you.
          </Text>

          {/* Search — course code first */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 20,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
            }}
          >
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by course code — e.g. CHM 101"
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                fontFamily: theme.typography.body.fontFamily,
                fontSize: 15,
                color: colors.textPrimary,
                paddingVertical: 13,
                paddingLeft: 10,
              }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <Text
            style={[
              theme.typography.caption,
              { color: colors.textMuted, marginTop: 8, marginBottom: 20 },
            ]}
          >
            Tip: search by course code first — it's how the Vault is organised.
          </Text>

          {/* Past-Question Vault */}
          <Pressable
            onPress={() => navigation.navigate("Vault" as never)}
            style={{ opacity: 0.6 }}
          >
            <View
              style={{
                padding: 20,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="layers" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                    Past-Question Vault
                  </Text>
                  <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                    Exams from previous sessions, per course
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    backgroundColor: colors.warningBg,
                  }}
                >
                  <Text style={[theme.typography.small, { color: colors.warning, fontWeight: "700" }]}>
                    Coming next
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* Upload */}
          <Pressable style={{ opacity: 0.6 }}>
            <View
              style={{
                padding: 20,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="upload" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                    Upload materials
                  </Text>
                  <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                    Share with your school — Public or Private, your call
                  </Text>
                </View>
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    backgroundColor: colors.warningBg,
                  }}
                >
                  <Text style={[theme.typography.small, { color: colors.warning, fontWeight: "700" }]}>
                    Coming next
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* Smart storage explainer */}
          <View
            style={{
              padding: 18,
              borderRadius: theme.radii.md,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
              marginTop: 6,
            }}
          >
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ marginTop: 2 }}>
                <Icon name="info" size={16} color={colors.textMuted} />
              </View>
              <Text style={[theme.typography.caption, { color: colors.textSecondary, flex: 1, lineHeight: 19 }]}>
                Uploads get a lightweight companion copy automatically — grab the
                light version when data is scarce, the original when detail matters.
                Your contributions help train a Matriq model tuned to your school.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
