import { View } from 'react-native';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default function OnboardingScreen() {
  return (
    <View className="flex-1 bg-surface">
      <OnboardingFlow />
    </View>
  );
}
