import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { colors, spacing, typography } from "../theme/colors";

interface WheelPickerProps {
  data: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  itemHeight?: number;
  visibleItems?: number;
}

/**
 * A scrollable wheel picker with snap-to-item. No native dependencies — a
 * plain ScrollView with a center highlight. Users scroll to find the value
 * (per the product requirement: scroll for day and month).
 */
export function WheelPicker({
  data,
  selectedIndex,
  onChange,
  itemHeight = 44,
  visibleItems = 5,
}: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(selectedIndex);
  const height = itemHeight * visibleItems;
  // Vertical padding so the first/last items can reach the center.
  const pad = Math.floor((height - itemHeight) / 2);
  const isMounted = useRef(false);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      scrollRef.current?.scrollTo({
        y: index * itemHeight,
        animated,
      });
    },
    [itemHeight],
  );

  // Scroll the wheel to the selection when the parent changes it (e.g. a
  // different month changes the day list).
  useEffect(() => {
    if (isMounted.current) {
      scrollToIndex(selectedIndex, true);
    }
  }, [selectedIndex, scrollToIndex]);

  const onLayout = () => {
    if (!isMounted.current) {
      isMounted.current = true;
      scrollToIndex(selectedIndex, false);
    }
  };

  const onScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ): void => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(
      0,
      Math.min(data.length - 1, Math.round(y / itemHeight)),
    );
    setActive(index);
    if (index !== selectedIndex) onChange(index);
  };

  return (
    <View style={[styles.wheel, { height }]}>
      {/* center highlight */}
      <View
        pointerEvents="none"
        style={[styles.highlight, { top: pad }]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onLayout={onLayout}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        contentContainerStyle={{ paddingVertical: pad }}
      >
        {data.map((label, i) => {
          const distance = Math.abs(i - active);
          const isActive = i === active;
          return (
            <View
              key={label}
              style={{ height: itemHeight, justifyContent: "center" }}
            >
              <Text
                style={[
                  styles.item,
                  isActive ? styles.itemActive : styles.itemInactive,
                  { opacity: isActive ? 1 : distance === 1 ? 0.55 : 0.3 },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: colors.primaryLight + "1A",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.primaryLight + "55",
    borderRadius: 10,
  },
  item: {
    ...typography.body,
    textAlign: "center",
    fontSize: 17,
  },
  itemActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  itemInactive: {
    color: colors.textPrimary,
  },
});
