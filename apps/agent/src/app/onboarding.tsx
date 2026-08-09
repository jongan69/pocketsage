import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react-native';

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Your AI runs entirely on this phone',
      subtitle: 'No cloud. No account. No data collection. Everything stays on your device, always.',
      bullets: [
        { icon: '🔒', text: 'Private by design — your data never leaves this phone' },
        { icon: '📡', text: 'Works offline — no internet needed after model download' },
        { icon: '🧠', text: 'Gets smarter — remembers your conversations' },
        { icon: '🛠', text: 'Can do things — calendar, reminders, health, files' },
      ],
    },
    {
      title: 'Choose your model',
      subtitle: 'Download once, use forever. The model runs on your phone — no cloud needed.',
    },
    {
      title: 'Enable skills',
      subtitle: 'Let PocketSage help with calendar, reminders, health data, files, and contacts.',
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Progress dots */}
      <View className="flex-row justify-center pt-6 pb-4 gap-2">
        {steps.map((_, i) => (
          <View
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-tertiary'}`}
          />
        ))}
      </View>

      {/* Content */}
      <View className="flex-1 px-6 justify-center">
        <Text className="text-text-primary text-3xl font-bold text-center mb-4">
          {current.title}
        </Text>
        <Text className="text-text-secondary text-base text-center leading-relaxed mb-8">
          {current.subtitle}
        </Text>

        {step === 0 && current.bullets && (
          <View className="gap-4">
            {current.bullets.map((b, i) => (
              <View key={i} className="flex-row items-center bg-surface-secondary rounded-xl px-4 py-3.5">
                <Text className="text-2xl mr-3">{b.icon}</Text>
                <Text className="text-text-secondary text-sm flex-1">{b.text}</Text>
              </View>
            ))}
          </View>
        )}

        {step === 1 && (
          <View className="gap-3">
            <Pressable className="bg-surface-secondary rounded-xl p-4 border-2 border-accent">
              <Text className="text-text-primary font-semibold">Llama 3.2 1B — Fast</Text>
              <Text className="text-text-muted text-sm mt-1">1.1 GB · Best for quick answers</Text>
            </Pressable>
            <Pressable className="bg-surface-secondary rounded-xl p-4">
              <Text className="text-text-primary font-semibold">Llama 3.2 3B — Powerful</Text>
              <Text className="text-text-muted text-sm mt-1">2.5 GB · Best for complex tasks</Text>
            </Pressable>
            <Pressable className="mt-2 py-2">
              <Text className="text-text-muted text-sm text-center">Skip for now</Text>
            </Pressable>
          </View>
        )}

        {step === 2 && (
          <View className="gap-3">
            {['Calendar', 'Reminders', 'Health', 'Files', 'Contacts'].map((s, i) => (
              <View key={i} className="bg-surface-secondary rounded-xl px-4 py-3.5 flex-row items-center justify-between">
                <Text className="text-text-primary">{s}</Text>
                <View className="w-5 h-5 rounded-full bg-accent items-center justify-center">
                  <Check size={12} color="#fff" />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Navigation */}
      <View className="px-6 pb-10 flex-row justify-between items-center">
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} className="flex-row items-center py-3">
            <ArrowLeft size={18} color="#a3a3a3" />
            <Text className="text-text-secondary ml-1">Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => (isLast ? router.replace('/(tabs)') : setStep(step + 1))}
          className="bg-accent rounded-full px-6 py-3 flex-row items-center"
        >
          <Text className="text-white font-semibold mr-2">
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          {isLast ? <Check size={18} color="#fff" /> : <ArrowRight size={18} color="#fff" />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
