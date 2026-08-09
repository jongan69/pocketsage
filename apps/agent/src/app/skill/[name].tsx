import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SkillDetail } from '@/components/skills/SkillDetail';

export default function SkillDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();

  if (!name) {
    return (
      <View className="flex-1 bg-surface items-center justify-center px-8">
        <Text className="text-text-secondary text-center">Skill not found</Text>
      </View>
    );
  }

  return <SkillDetail skillName={name} />;
}
