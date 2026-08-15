import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { FileToolScreen } from "./FileToolScreen";

const BG_COLORS = [
  { label: "White", value: "#FFFFFF", swatch: "#FFFFFF" },
  { label: "Blue", value: "#3B82F6", swatch: "#3B82F6" },
  { label: "Red", value: "#DC2626", swatch: "#DC2626" },
];

export function PassportRemoverScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [color, setColor] = useState("#FFFFFF");

  return (
    <FileToolScreen
      title="Passport background remover"
      subtitle="Replace a plain, evenly-lit background with a solid colour."
      icon="camera"
      endpoint="/tools/passport"
      fieldName="image"
      mode="image"
      pickLabel="Choose a photo"
      runLabel="Remove background"
      emptyHint="Pick a photo with a plain background"
      successHint="Works best on flat, evenly-lit backgrounds — not busy scenes."
      extraFields={{ color }}
      renderExtras={() => (
        <View style={{ marginTop: 16 }}>
          <Text
            style={[
              theme.typography.captionBold,
              { color: colors.textSecondary, marginBottom: 8 },
            ]}
          >
            New background colour
          </Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {BG_COLORS.map((c) => {
              const selected = color === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setColor(c.value)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: theme.radii.pill,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.brand : colors.border,
                    backgroundColor: selected ? colors.surfaceAlt : colors.surface,
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: c.swatch,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                  <Text style={[theme.typography.bodyMedium, { color: colors.textPrimary }]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
  );
}
