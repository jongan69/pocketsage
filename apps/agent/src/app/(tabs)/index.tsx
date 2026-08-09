import { useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { useConversationStore } from '@/stores/conversation-store';
import { useAgent } from '@/hooks/useAgent';
import { SUGGESTED_PROMPTS } from '@/lib/constants';

function EmptyConversationList() {
  const conversations = useConversationStore((s) => s.conversations);
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation);
  const { sendMessage } = useAgent();

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      useConversationStore.getState().createConversation();
      void sendMessage(prompt);
    },
    [sendMessage],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 px-6 pt-16">
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-accent/20 rounded-2xl items-center justify-center mb-4">
            <Sparkles size={32} color="#6366f1" />
          </View>
          <Text className="text-text-primary text-2xl font-bold mb-2">
            Hi, I'm PocketSage
          </Text>
          <Text className="text-text-secondary text-center text-base leading-relaxed">
            I run entirely on this phone.{'\n'}Ask me anything.
          </Text>
        </View>

        <View className="mb-8">
          <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3 ml-1">
            Try asking
          </Text>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt}
              onPress={() => handleSuggestedPrompt(prompt)}
              className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 active:opacity-80"
            >
              <Text className="text-text-secondary text-sm">{prompt}</Text>
            </Pressable>
          ))}
        </View>

        {conversations.length > 0 && (
          <View className="flex-1">
            <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3 ml-1">
              Recent conversations
            </Text>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setActiveConversation(item.id)}
                  className="bg-surface-secondary rounded-xl px-4 py-3 mb-2 active:opacity-80"
                >
                  <Text className="text-text-primary text-sm font-medium" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-text-muted text-xs mt-1">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function ChatTab() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId);

  if (activeConversationId !== null) {
    return <ChatScreen />;
  }

  return <EmptyConversationList />;
}
