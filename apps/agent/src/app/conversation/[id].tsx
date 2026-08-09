import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useConversationStore } from '@/stores/conversation-store';
import { MessageBubble } from '@/components/chat/MessageBubble';

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations } = useConversationStore();
  const conversation = conversations.find((c) => c.id === id);

  if (!conversation) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <Text className="text-text-secondary text-lg text-center">Conversation not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-accent font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-surface-tertiary">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 mr-2">
          <ArrowLeft size={22} color="#a3a3a3" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-base" numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text className="text-text-muted text-xs">
            {new Date(conversation.createdAt).toLocaleDateString()} · {conversation.messages.length} messages
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        data={conversation.messages}
        keyExtractor={(_, i) => `msg_${i}`}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 16 }}
        renderItem={({ item }) => (
          <MessageBubble role={item.role} content={item.content} />
        )}
        ListEmptyComponent={
          <View className="items-center py-20">
            <Text className="text-text-muted">No messages</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
