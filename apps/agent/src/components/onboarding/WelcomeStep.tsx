import React from 'react';
import { View, Text } from 'react-native';
import { Shield, Lock, WifiOff, Brain, Zap } from 'lucide-react-native';

const BULLETS = [
  { icon: Lock, title: 'Private by design', description: 'Your data never leaves this phone' },
  { icon: WifiOff, title: 'Works offline', description: 'No internet needed after model download' },
  { icon: Brain, title: 'Gets smarter', description: 'Remembers your conversations' },
  { icon: Zap, title: 'Can do things', description: 'Calendar, reminders, health, files, contacts' },
];

/** Onboarding step 1: privacy-first value proposition. */
export const WelcomeStep = React.memo(function WelcomeStep() {
  return (
    <View className="flex-1 justify-center pb-6">
      {/* Hero */}
      <View className="items-center mb-8">
        <View className="w-20 h-20 rounded-3xl bg-accent/20 items-center justify-center mb-5">
          <Shield size={40} color="#6366f1" />
        </View>
        <Text className="text-text-primary text-3xl font-bold text-center leading-tight">
          Your AI runs entirely on this phone
        </Text>
        <Text className="text-text-secondary text-base text-center leading-relaxed mt-3 px-2">
          No cloud. No account. No data collection. Everything stays on your device, always.
        </Text>
      </View>

      {/* Bullets */}
      <View className="gap-3">
        {BULLETS.map(({ icon: Icon, title, description }) => (
          <View key={title} className="flex-row items-center bg-surface-secondary rounded-xl px-4 py-3.5">
            <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
              <Icon size={18} color="#6366f1" />
            </View>
            <View className="flex-1">
              <Text className="text-text-primary text-sm font-semibold">{title}</Text>
              <Text className="text-text-muted text-xs mt-0.5">{description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});
