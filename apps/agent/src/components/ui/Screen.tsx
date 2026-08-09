import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
}

export const Screen = React.memo(function Screen({
  children,
  scroll = false,
  className,
}: ScreenProps) {
  const content = (
    <View className={`flex-1 px-4 ${className ?? ''}`}>{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {scroll ? <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
});
