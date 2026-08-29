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

/** Generic 2-column grid card item (tools + portal services). */
interface GridCardItem {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  /** Optional per-card icon + glow color (e.g. WhatsApp green). */
  iconColor?: string;
  glow?: string;
  onPress: () => void;
}

const AI_TOOLS: ToolCard[] = [
  { id: "ocr", label: "Image to Text (OCR)", hint: "Read text from a photo", icon: "image", target: "Ocr" },
];

const DOC_TOOLS: ToolCard[] = [
  { id: "img2pdf", label: "Image to PDF", hint: "Photos into one document", icon: "fileText", target: "ImageToPdf" },
];

const GRADE_TOOLS: ToolCard[] = [
  { id: "cgpa", label: "CGPA Calculator", hint: "NUC 5-point scale", icon: "target", target: "CgpaCalculator" },
  { id: "predictor", label: "CGPA Predictor", hint: "What's possible next semester", icon: "trendingUp", target: "CgpaCalculator" },
];

export function ToolsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;

  /** Generic 2-column grid card — icon top-left in a glowing square, title +
   *  subtitle stacked beneath. Blends with the theme: frosted dark card in
   *  Glass, clay sticker card in Pop. */
  const renderGridCard = (item: GridCardItem) => (
    <Pressable
      key={item.id}
      onPress={item.onPress}
      style={{ width: "48%", marginBottom: 12 }}
      accessibilityRole="button"
    >
      <View
        style={[
          {
            padding: 14,
            borderRadius: theme.radii.lg,
            minHeight: 112,
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
          numberOfLines={2}
          style={[
            theme.typography.bodyBold,
            { color: colors.textPrimary, fontSize: 14, lineHeight: 19, marginTop: 12 },
          ]}
        >
          {item.label}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            theme.typography.caption,
            { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3 },
          ]}
        >
          {item.hint}
        </Text>
      </View>
    </Pressable>
  );

  /** Rows grid items into the 2-column table arrangement. */
  const grid = (items: GridCardItem[]) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
      {items.map(renderGridCard)}
    </View>
  );

  const sectionTitle = (label: string) => (
    <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
      {label}
    </Text>
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

          {/* Portal — first, per round-2 QA §7 */}
          {sectionTitle("Portal")}
          <Pressable onPress={() => Linking.openURL(PORTAL_URL).catch(() => {})}>
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
                marginBottom: 10,
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

          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 6, marginBottom: 10 }]}>
            Portal Services → WhatsApp
          </Text>
          {grid(
            PORTAL_SERVICE_ACTIONS.map((action) => ({
              id: action.id,
              label: action.label,
              hint: "Via WhatsApp",
              icon: "phone",
              iconColor: colors.success,
              glow:
                theme.mode === "glass"
                  ? "rgba(142,240,172,0.4)"
                  : "rgba(31,122,51,0.4)",
              onPress: () => Linking.openURL(whatsappLinkFor(action)).catch(() => {}),
            })),
          )}
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Each action opens WhatsApp with a ready message — no form-filling.
          </Text>

          {sectionTitle("AI utilities")}
          {grid(
            AI_TOOLS.map((tool) => ({
              id: tool.id,
              label: tool.label,
              hint: tool.hint,
              icon: tool.icon,
              onPress: () => stackNav?.navigate(tool.target),
            })),
          )}

          {sectionTitle("Documents")}
          {grid(
            DOC_TOOLS.map((tool) => ({
              id: tool.id,
              label: tool.label,
              hint: tool.hint,
              icon: tool.icon,
              onPress: () => stackNav?.navigate(tool.target),
            })),
          )}
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Turn photos of notes, handouts and board work into one clean PDF — built entirely on your phone.
          </Text>

          {sectionTitle("Grades")}
          {grid(
            GRADE_TOOLS.map((tool) => ({
              id: tool.id,
              label: tool.label,
              hint: tool.hint,
              icon: tool.icon,
              onPress: () => stackNav?.navigate(tool.target),
            })),
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
