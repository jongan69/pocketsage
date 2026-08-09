import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { useConversationStore } from '@/stores/conversation-store';
import { useAgent } from '@/hooks/useAgent';
import { SUGGESTED_PROMPTS } from '@/lib/constants';

export default function ChatTab() {
  const { activeConversationId, activeMessages, createConversation, setActiveConversation, conversations } =
    useConversationStore();
  const { sendMessage, isStreaming, messages } = useAgent();

  // If there's an active conversation, show chat UI
  if (activeConversationId) {
    // ChatScreen component handles the full chat UI
    // For now, render the ChatScreen from components
    const ChatScreen = require('@/components/chat/ChatScreen').ChatScreen;
    return <ChatScreen />;
  }

  // Empty state
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 px-6 pt-16">
        {/* Header */}
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

        {/* Suggested prompts */}
        <View className="mb-8">
          <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3 ml-1">
            Try asking
          </Text>
          {SUGGESTED_PROMPTS.map((prompt, i) => (
            <Pressable
              key={i}
              onPress={() => {
                createConversation();
                sendMessage(prompt);
              }}
              className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 active:opacity-80"
            >
              <Text className="text-text-secondary text-sm">{prompt}</Text>
            </Pressable>
          ))}
        </View>

        {/* Recent conversations */}
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
