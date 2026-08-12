import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button } from "../../components";

const ONBOARDING_SEEN_KEY = "onboarding_seen";

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "people",
    title: "Join your association",
    body: "Verify your student identity and join your department or faculty association in minutes — no paper forms.",
  },
  {
    icon: "wallet",
    title: "Dues, receipts & updates",
    body: "Pay dues securely, get instant QR receipts, and never miss an announcement, event, or deadline.",
  },
  {
    icon: "sparkles",
    title: "Your AI study companion",
    body: "Ask questions and get answers grounded in your association's approved study materials, anytime.",
  },
];

interface Props {
  navigation: { reset: (state: { index: number; routes: { name: string }[] }) => void };
}

export function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finish = async () => {
    try {
      await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, "1");
    } catch {
      // Non-fatal: user sees onboarding again next launch.
    }
    navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      void finish();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    if (nextIndex !== index) setIndex(nextIndex);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        {!isLast ? (
          <TouchableOpacity onPress={() => void finish()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={styles.slide}>
            <View style={styles.iconCircle}>
              <Ionicons name={slide.icon} size={56} color={colors.primary} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button title={isLast ? "Get Started" : "Next"} onPress={next} size="lg" />
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  skip: { ...typography.captionBold, color: colors.textMuted },
  slide: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  iconCircle: {
    width: 132,
    height: 132,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight + "33",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    fontSize: 26,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 320,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 22,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
