import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';

interface DownloadProgressProps {
  /** Download progress, 0–1. */
  progress: number;
  /** Optional label shown above the bar, e.g. "Downloading model…". */
  label?: string;
  /** When provided, renders a cancel action. */
  onCancel?: () => void;
}

/** Animated download progress bar with percentage and optional cancel. */
export const DownloadProgress = React.memo(function DownloadProgress({
  progress,
  label,
  onCancel,
}: DownloadProgressProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: clamped,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, widthAnim]);

  const percent = Math.round(clamped * 100);

  return (
    <View>
      {label && <Text className="text-text-secondary text-xs mb-1.5">{label}</Text>}

      {/* Track + fill */}
      <View className="flex-row items-center gap-3">
        <View className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
          <Animated.View
            className="h-full rounded-full bg-accent"
            style={{
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            }}
          />
        </View>
        <Text className="text-text-secondary text-xs font-medium w-10 text-right">{percent}%</Text>
      </View>

      {/* Cancel */}
      {onCancel && (
        <Pressable onPress={onCancel} className="self-end mt-2 px-1 py-0.5">
          <Text className="text-danger text-xs font-medium">Cancel download</Text>
        </Pressable>
      )}
    </View>
  );
});
