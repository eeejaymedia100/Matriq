import React, { useRef, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { TAGLINE } from "../../theme/tokens";
import { Button } from "../../components";
import { Icon, type IconName } from "../../components/icons";
import { setItem, getItem } from "../../utils/storage";

export const ONBOARDING_SEEN_KEY = "onboarding_seen";

interface Slide {
  icon: IconName;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "sparkle",
    title: "Your AI, even offline.",
    body: "Download a small model once, then ask questions anywhere — lectures, road trips, dead spots. No internet needed.",
  },
  {
    icon: "vault",
    title: "The Vault.",
    body: "Past questions and study materials shared by students like you. Search by course code, grab light versions when data is scarce.",
  },
  {
    icon: "zap",
    title: "Built for Nigerian data.",
    body: "Offline-first and light. Everything that matters keeps working when the network doesn't.",
  },
];

interface Props {
  navigation: {
    reset: (state: { index: number; routes: { name: string }[] }) => void;
  };
}

export function OnboardingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const finish = async () => {
    try {
      await setItem(ONBOARDING_SEEN_KEY, "1");
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 24,
          paddingTop: 16,
        }}
      >
        {!isLast ? (
          <TouchableOpacity
            onPress={() => void finish()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[theme.typography.captionBold, { color: colors.textMuted }]}>
              Skip
            </Text>
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
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View
              style={{
                width: 132,
                height: 132,
                borderRadius: 999,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 32,
                boxShadow:
                  theme.mode === "glass"
                    ? "0 0 60px rgba(198,255,61,0.12)"
                    : "3px 3px 0 rgba(23,11,38,0.15)",
              }}
            >
              <Icon name={slide.icon} size={54} color={colors.accent} strokeWidth={1.7} />
            </View>
            <Text
              style={[
                theme.typography.display,
                { color: colors.textPrimary, textAlign: "center", marginBottom: 14 },
              ]}
            >
              {slide.title}
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: colors.textSecondary, textAlign: "center", lineHeight: 25, maxWidth: 320 },
              ]}
            >
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === index ? colors.accent : colors.border,
            }}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        <Button title={isLast ? "Get Started" : "Next"} onPress={next} size="lg" />
        <Text
          style={[
            theme.typography.caption,
            { color: colors.textMuted, textAlign: "center", marginTop: 16 },
          ]}
        >
          Pay association dues in one tap — instant QR receipts.
        </Text>
        <Text
          style={[
            theme.typography.small,
            {
              color: colors.textMuted,
              textAlign: "center",
              marginTop: 8,
              letterSpacing: 1,
              textTransform: "uppercase",
            },
          ]}
        >
          {TAGLINE}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");

const styles = {
  slide: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
};
