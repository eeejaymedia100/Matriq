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

type ToolTarget =
  | "CgpaCalculator"
  | "Ocr"
  | "ImageToPdf"
  | "FileCompressor"
  | "PdfMerge"
  | "PdfSplit"
  | "PdfToWord"
  | "WordToPdf";

interface ToolCard {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  target: ToolTarget;
}

const AI_TOOLS: ToolCard[] = [
  { id: "ocr", label: "Image to Text (OCR)", hint: "Read text from a photo", icon: "image", target: "Ocr" },
];

const DOC_TOOLS: ToolCard[] = [
  { id: "img2pdf", label: "Image to PDF", hint: "Photos into one document", icon: "fileText", target: "ImageToPdf" },
  { id: "compress", label: "File Compressor", hint: "Shrink any file", icon: "layers", target: "FileCompressor" },
  { id: "pdf-merge", label: "PDF merge", hint: "Combine PDFs into one", icon: "layers", target: "PdfMerge" },
  { id: "pdf-split", label: "PDF split", hint: "Divide into pages", icon: "fileText", target: "PdfSplit" },
  { id: "pdf-word", label: "PDF → Word", hint: "Extract text to .docx", icon: "fileText", target: "PdfToWord" },
  { id: "word-pdf", label: "Word → PDF", hint: "Convert a .docx", icon: "pen", target: "WordToPdf" },
];

const GRADE_TOOLS: ToolCard[] = [
  { id: "cgpa", label: "CGPA Calculator", hint: "NUC 5-point scale", icon: "target", target: "CgpaCalculator" },
  { id: "predictor", label: "CGPA Predictor", hint: "What's possible next semester", icon: "trendingUp", target: "CgpaCalculator" },
];

export function ToolsScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const stackNav = navigation.getParent() as { navigate: (s: string) => void } | undefined;

  const renderTool = (tool: ToolCard) => (
    <Pressable
      key={tool.id}
      onPress={() => stackNav?.navigate(tool.target)}
      style={{ marginBottom: 10 }}
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
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );

  const sectionTitle = (label: string) => (
    <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 12 }]}>
      {label}
    </Text>
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

          {sectionTitle("AI utilities")}
          {AI_TOOLS.map(renderTool)}

          {sectionTitle("Documents")}
          {DOC_TOOLS.map(renderTool)}

          {sectionTitle("Grades")}
          {GRADE_TOOLS.map(renderTool)}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
