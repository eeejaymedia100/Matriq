import React from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { Icon } from "../../components/icons";
import { bytesLabel } from "../../utils/files";
import type { LibraryDoc } from "./types";

/**
 * A compact document card for the horizontal discovery rows (and grid).
 * Shows a real lightweight preview when the document generated one (image
 * companion thumbnail) instead of a generic file icon for everything.
 */
export function DocumentCard({
  doc,
  onPress,
  width = 176,
  saved = false,
}: {
  doc: LibraryDoc;
  onPress: () => void;
  width?: number;
  saved?: boolean;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;

  const isPdf = doc.mimeType === "application/pdf";

  return (
    <Pressable onPress={onPress} style={{ width, marginRight: 12 }}>
      {/* Preview / cover — a real generated preview (image companion), else a
          lightweight type-styled cover with the course code. */}
      <View
        style={{
          width,
          height: 108,
          borderRadius: theme.radii.lg,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {doc.previewUrl && doc.isImage ? (
          <Image
            source={{ uri: doc.previewUrl }}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Icon
              name={doc.type === "past_question" ? "layers" : "fileText"}
              size={30}
              color={isPdf ? colors.error : colors.brand}
            />
            <Text
              style={[
                theme.typography.captionBold,
                { color: colors.textSecondary, marginTop: 8 },
              ]}
              numberOfLines={1}
            >
              {doc.courseCode}
            </Text>
          </View>
        )}

        {/* Type chip */}
        <View
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            borderRadius: 6,
            paddingHorizontal: 7,
            paddingVertical: 2,
            backgroundColor: colors.overlay,
          }}
        >
          <Text style={[theme.typography.small, { color: "#fff", fontWeight: "800", fontSize: 10 }]}>
            {doc.type === "past_question" ? "Past Q" : "Material"}
          </Text>
        </View>

        {saveIndicator(doc, saved, colors)}
      </View>

      {/* Meta */}
      <View style={{ marginTop: 8, paddingHorizontal: 2 }}>
        <Text
          style={[theme.typography.captionBold, { color: colors.textPrimary, lineHeight: 16 }]}
          numberOfLines={2}
        >
          {doc.title}
        </Text>
        <Text
          style={[theme.typography.small, { color: colors.brand, marginTop: 3, fontWeight: "700" }]}
          numberOfLines={1}
        >
          {doc.courseCode}
          {doc.courseTitle ? ` · ${doc.courseTitle}` : ""}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
          <Icon name="dot" size={8} color={colors.textMuted} />
          <Text
            style={[theme.typography.small, { color: colors.textMuted, flex: 1, fontSize: 11 }]}
            numberOfLines={1}
          >
            {doc.institution?.name ?? "Community"}
            {doc.level ? ` · L${doc.level}` : ""}
          </Text>
        </View>
        <Text
          style={[theme.typography.small, { color: colors.textMuted, marginTop: 2, fontSize: 10 }]}
          numberOfLines={1}
        >
          {bytesLabel(doc.sizeBytes)} · {countLabel(doc)}
        </Text>
      </View>
    </Pressable>
  );
}

function saveIndicator(
  _doc: LibraryDoc,
  saved: boolean,
  colors: any,
) {
  return (
    <View
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: saved ? colors.accent : colors.overlay,
      }}
    >
      <Icon name={saved ? "check" : "book"} size={12} color={saved ? "#170B26" : "#fff"} />
    </View>
  );
}

function countLabel(doc: LibraryDoc): string {
  const parts: string[] = [];
  if (doc.opens > 0) parts.push(`${doc.opens} reads`);
  if (doc.savesCount > 0) parts.push(`${doc.savesCount} saved`);
  return parts.join(" · ") || "New";
}