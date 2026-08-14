import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";

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
  const { theme } = useTheme();
  const colors = theme.colors;
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(selectedIndex);
  const height = itemHeight * visibleItems;
  const pad = Math.floor((height - itemHeight) / 2);
  const isMounted = useRef(false);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      scrollRef.current?.scrollTo({ y: index * itemHeight, animated });
    },
    [itemHeight],
  );

  useEffect(() => {
    if (isMounted.current) scrollToIndex(selectedIndex, true);
  }, [selectedIndex, scrollToIndex]);

  const onLayout = () => {
    if (!isMounted.current) {
      isMounted.current = true;
      scrollToIndex(selectedIndex, false);
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(
      0,
      Math.min(data.length - 1, Math.round(y / itemHeight)),
    );
    setActive(index);
    if (index !== selectedIndex) onChange(index);
  };

  return (
    <View style={{ height, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: pad,
          height: itemHeight,
          backgroundColor: colors.surfaceAlt,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
        }}
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
            <View key={label} style={{ height: itemHeight, justifyContent: "center" }}>
              <Text
                style={[
                  {
                    fontFamily: isActive
                      ? theme.typography.bodyBold.fontFamily
                      : theme.typography.body.fontFamily,
                    fontSize: 17,
                    textAlign: "center",
                    color: isActive ? colors.brand : colors.textPrimary,
                    opacity: isActive ? 1 : distance === 1 ? 0.55 : 0.3,
                  },
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
