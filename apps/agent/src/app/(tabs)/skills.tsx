import { View, Text, FlatList, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Puzzle } from 'lucide-react-native';
import { useSkillStore } from '@/stores/skill-store';
import { Card } from '@/components/ui/Card';

export default function SkillsTab() {
  const { skills, enabledSkills, toggleSkill } = useSkillStore();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-text-primary text-2xl font-bold">Skills</Text>
        <Text className="text-text-secondary text-sm mt-1">
          Enable skills to let PocketSage do more
        </Text>
      </View>

      <FlatList
        data={skills}
        keyExtractor={(item) => item.metadata.name}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item: skill }) => {
          const enabled = enabledSkills.has(skill.metadata.name);
          return (
            <Pressable
              onPress={() => router.push(`/skill/${skill.metadata.name}`)}
              className="mb-2"
            >
              <Card className="flex-row items-center justify-between active:opacity-80">
                <View className="flex-1 mr-4">
                  <Text className="text-text-primary font-semibold text-base">
                    {skill.metadata.description}
                  </Text>
                  <Text className="text-text-muted text-xs mt-0.5">
                    {Object.keys(skill.tools).length} tools · v{skill.metadata.version}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => toggleSkill(skill.metadata.name, v)}
                  trackColor={{ false: '#1c1c1c', true: '#4338ca' }}
                  thumbColor={enabled ? '#6366f1' : '#525252'}
                />
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-20">
            <Puzzle size={48} color="#525252" />
            <Text className="text-text-secondary mt-4">No skills available</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
