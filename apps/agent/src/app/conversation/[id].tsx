import { useCallback, useEffect, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageSquareOff } from 'lucide-react-native';
import type { Message } from '@pocketsage/agent-runtime';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useConversationStore } from '@/stores/conversation-store';

/**
 * Read-only view of a past conversation. Selecting a conversation here also
 * marks it active, so the Chat tab can continue it.
 */
export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const conversation = useConversationStore((s) =>
    s.conversations.find((c) => c.id === id),
  );
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation);

  useEffect(() => {
    if (id) setActiveConversation(id);
  }, [id, setActiveConversation]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => <MessageBubble role={item.role} content={item.content} />,
    [],
  );

  const header = useMemo(() => {
    if (!conversation) return null;
    return (
      <View
        className="flex-row items-center px-4 py-3 border-b border-surface-tertiary bg-surface"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable onPress={goBack} className="p-2 -ml-2 mr-2">
          <ArrowLeft size={22} color="#a3a3a3" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-base" numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text className="text-text-muted text-xs">
            {new Date(conversation.createdAt).toLocaleDateString()} ·{' '}
            {conversation.messages.length} messages
          </Text>
        </View>
      </View>
    );
  }, [conversation, goBack, insets.top]);

  if (!conversation) {
    return (
      <View
        className="flex-1 bg-surface items-center justify-center px-8"
        style={{ paddingTop: insets.top }}
      >
        <MessageSquareOff size={40} color="#525252" />
        <Text className="text-text-secondary text-lg text-center mt-4">
          Conversation not found
        </Text>
        <Pressable onPress={goBack} className="mt-6 bg-accent rounded-full px-6 py-3">
          <Text className="text-white font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      {header}
      <FlatList
        data={conversation.messages}
        keyExtractor={(item, index) => `${item.role}-${index}`}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingVertical: 16, flexGrow: 1 }}
        renderItem={renderMessage}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center">
            <Text className="text-text-muted">No messages</Text>
          </View>
        }
      />
    </View>
  );
}
