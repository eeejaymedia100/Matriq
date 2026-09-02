import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon, type IconName } from "../../components/icons";
import { PORTAL_URL, PORTAL_SERVICE_ACTIONS, whatsappLinkFor } from "../../constants/portal";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Tools">;

type ToolTarget = "CgpaCalculator" | "Ocr" | "ImageToPdf";

interface ToolCard {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  target: ToolTarget;
}

interface GridCardItem {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  iconColor?: string;
  glow?: string;
  onPress: () => void;
}

/** One unified tools grid — deliberately no category titles (round-4 pass:
 *  tools sit together, equal-height boxes, WhatsApp services moved to the
 *  very bottom of the screen). */
const ALL_TOOLS: ToolCard[] = [
  { id: "ocr", label: "Image to Text (OCR)", hint: "Read text from a photo", icon: "image", target: "Ocr" },
  { id: "img2pdf", label: "Image to PDF", hint: "Photos into one document", icon: "fileText", target: "ImageToPdf" },
  { id: "cgpa", label: "CGPA Calculator", hint: "NUC 5-point scale", icon: "target", target: "CgpaCalculator" },
  { id: "predictor", label: "CGPA Predictor", hint: "What's possible next semester", icon: "trendingUp", target: "CgpaCalculator" },
];

const GRID_CARD_HEIGHT = 118;

export function ToolsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;

  /** 2-column grid card — every box is the SAME height with the icon on top,
   *  the label pinned above a flex spacer and the hint pinned to the bottom,
   *  so short and long text never make boxes differ in size. */
  const renderGridCard = (item: GridCardItem) => (
    <Pressable
      key={item.id}
      onPress={item.onPress}
      style={{ width: "48%", marginBottom: 12 }}
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${item.hint}`}
    >
      <View
        style={[
          {
            padding: 14,
            borderRadius: theme.radii.lg,
            height: GRID_CARD_HEIGHT,
          },
          theme.mode === "glass"
            ? {
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: colors.border,
              }
            : {
                backgroundColor: colors.surface,
                borderWidth: 2,
                borderColor: colors.borderStrong,
              },
        ]}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              theme.mode === "glass" ? "rgba(255,255,255,0.08)" : colors.surfaceAlt,
            // Soft glow behind the icon (new-arch + web boxShadow).
            boxShadow: `0 0 18px ${item.glow ?? "rgba(123,75,196,0.45)"}`,
          }}
        >
          <Icon name={item.icon} size={18} color={item.iconColor ?? colors.brand} />
        </View>
        <Text
          numberOfLines={1}
          style={[
            theme.typography.bodyBold,
            { color: colors.textPrimary, fontSize: 14, lineHeight: 19, marginTop: 10 },
          ]}
        >
          {item.label}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          numberOfLines={1}
          style={[
            theme.typography.caption,
            { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
          ]}
        >
          {item.hint}
        </Text>
      </View>
    </Pressable>
  );

  const grid = (items: GridCardItem[]) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
      {items.map(renderGridCard)}
    </View>
  );

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Tools</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Fast utilities, no hype.
          </Text>

          {/* School Portal — distinct action, opens in the browser */}
          <Pressable onPress={() => Linking.openURL(PORTAL_URL).catch(() => {})} style={{ marginTop: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: theme.radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="globe" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
                  School Portal
                </Text>
                <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
                  Opens in your browser — we never see your login
                </Text>
              </View>
              <Icon name="link" size={18} color={colors.textMuted} />
            </View>
          </Pressable>

          {/* All tools, one unified grid — no category titles, equal boxes */}
          <View style={{ marginTop: 20 }}>
            {grid(
              ALL_TOOLS.map((tool) => ({
                id: tool.id,
                label: tool.label,
                hint: tool.hint,
                icon: tool.icon,
                onPress: () => stackNav?.navigate(tool.target),
              })),
            )}
          </View>
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 0 }]}>
            Turn photos of notes, handouts and board work into one clean PDF — built on your phone.
          </Text>

          {/* Portal services — WhatsApp, at the very bottom (round-4 pass) */}
          <View
            style={{
              marginTop: 26,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 18,
            }}
          >
            <Text
              style={[
                theme.typography.captionBold,
                {
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                },
              ]}
            >
              School portal services
            </Text>
            <Text style={[theme.typography.caption, { color: colors.textSecondary, marginBottom: 10 }]}>
              Need something from your portal? Each action opens WhatsApp with a ready message.
            </Text>
            <View style={{ gap: 10 }}>
              {PORTAL_SERVICE_ACTIONS.map((action) => (
                <Pressable
                  key={action.id}
                  onPress={() => Linking.openURL(whatsappLinkFor(action)).catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.label}, via WhatsApp`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceAlt,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="phone" size={17} color={colors.success} />
                  </View>
                  <Text
                    style={[theme.typography.bodyBold, { color: colors.textPrimary, flex: 1, fontSize: 14 }]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                  <Text style={[theme.typography.small, { color: colors.textMuted }]}>WhatsApp</Text>
                  <Icon name="chevronRight" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}