import React from "react";
import { Image, type ImageStyle } from "react-native";

/**
 * The Matriq brand mark — the official uploaded logo asset (transparent PNG),
 * used everywhere in-app. Never recreate it with text or boxes: the app icon,
 * splash and every in-app moment share this one asset so the brand is
 * pixel-identical everywhere.
 */
const MARK_SOURCE = require("../../assets/brand-mark.png");

export function MatriqMark({
  size = 44,
  style,
}: {
  /** Rendered square size in px. */
  size?: number;
  style?: ImageStyle;
}) {
  return (
    <Image
      source={MARK_SOURCE}
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
    />
  );
}
