import React from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon, type IconName } from "../../components/icons";
import { PORTAL_URL, PORTAL_SERVICE_ACTIONS, whatsappLinkFor } from "../../constants/portal";
import type { MainTabParamList } from "../../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Tools">;

interface ToolCard {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  ready: boolean;
  target?: "CgpaCalculator" | "Ocr" | "ImageToPdf" | "FileCompressor";
}

const DOC_TOOLS: ToolCard[] = [
  { id: "ocr", label: "Image to Text (OCR)", hint: "Read text from a photo", icon: "image", ready: true, target: "Ocr" },
  { id: "img2pdf", label: "Image to PDF", hint: "Photos into one document", icon: "fileText", ready: true, target: "ImageToPdf" },
  { id: "compress", label: "File Compressor", hint: "Shrink any file", icon: "layers", ready: true, target: "FileCompressor" },
  { id: "pdf-merge", label: "PDF merge / split", hint: "Combine or divide PDFs", icon: "layers", ready: false },
  { id: "pdf-word", label: "PDF ↔ Word", hint: "Convert documents", icon: "pen", ready: false },
  { id: "bg-remover", label: "Passport background remover", hint: "Clean official photos", icon: "camera", ready: false },
  { id: "citation", label: "Citation generator", hint: "APA · MLA · Harvard", icon: "book", ready: false },
];

const GRADE_TOOLS: ToolCard[] = [
  { id: "cgpa", label: "CGPA Calculator", hint: "NUC 5-point scale", icon: "target", ready: true, target: "CgpaCalculator" },
  { id: "predictor", label: "CGPA Predictor", hint: "What's possible next semester", icon: "trendingUp", ready: true, target: "CgpaCalculator" },
];

export function ToolsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;

  const renderTool = (tool: ToolCard) => (
    <Pressable
      key={tool.id}
      style={{ opacity: tool.ready ? 1 : 0.55 }}
      disabled={!tool.ready}
      onPress={() => tool.target && stackNav?.navigate(tool.target)}
    >
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
          <Icon name={tool.icon} size={20} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyBold, { color: colors.textPrimary }]}>
            {tool.label}
          </Text>
          <Text style={[theme.typography.caption, { color: colors.textMuted }]}>
            {tool.hint}
          </Text>
        </View>
        {tool.ready ? (
          <Icon name="chevronRight" size={18} color={colors.textMuted} />
        ) : (
          <Text style={[theme.typography.small, { color: colors.textMuted, fontWeight: "700" }]}>
            Soon
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>Tools</Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Fast utilities, no hype.
          </Text>

          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
            Documents
          </Text>
          {DOC_TOOLS.map(renderTool)}

          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 12 }]}>
            Grades
          </Text>
          {GRADE_TOOLS.map(renderTool)}

          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 12 }]}>
            Portal
          </Text>

          {/* School Portal — plain link only */}
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

          {/* Portal Services → WhatsApp */}
          <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginTop: 6, marginBottom: 10 }]}>
            Portal Services → WhatsApp
          </Text>
          {PORTAL_SERVICE_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => Linking.openURL(whatsappLinkFor(action)).catch(() => {})}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: theme.radii.md,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 8,
              }}
            >
              <Icon name="phone" size={18} color={colors.success} />
              <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary, flex: 1 }]}>
                {action.label}
              </Text>
              <Icon name="chevronRight" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          <Text style={[theme.typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Each action opens WhatsApp with a ready message — no form-filling.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
