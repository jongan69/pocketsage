import React, { useCallback, useRef } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConversationStore } from '@/stores/conversation-store';
import { useAgent } from '@/hooks/useAgent';
import { useModels } from '@/hooks/useModels';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { ToolConfirmation } from './ToolConfirmation';
import { Spinner } from '@/components/ui/Spinner';
import { Sparkles } from 'lucide-react-native';

export function ChatScreen() {
  const conversation = useConversationStore();
  const { sendMessage, cancelGeneration, isStreaming, messages } = useAgent();
  const { isReady } = useModels();
  const flatListRef = useRef<FlatList>(null);

  const activeMessages = conversation.activeMessages();
  const streamingText = conversation.streamingText;
  const pendingConfirmation = conversation.pendingToolConfirmation;

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleConfirm = useCallback(() => {
    conversation.clearToolConfirmation();
  }, [conversation]);

  const handleDeny = useCallback(() => {
    conversation.clearToolConfirmation();
  }, [conversation]);

  // Loading state
  if (!isReady && activeMessages.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <View className="items-center px-8">
          <Spinner size="large" />
          <Text className="text-text-secondary mt-4 text-base text-center">
            Waking up your on-device AI...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View className="px-4 py-3 border-b border-surface-tertiary">
          <View className="flex-row items-center">
            <View className="w-8 h-8 bg-accent/20 rounded-lg items-center justify-center mr-3">
              <Sparkles size={16} color="#6366f1" />
            </View>
            <View className="flex-1">
              <Text className="text-text-primary font-semibold text-base">
                PocketSage
              </Text>
              <Text className="text-text-muted text-xs">
                {isStreaming ? 'Thinking...' : 'On-device'}
              </Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={activeMessages}
          keyExtractor={(_, i) => `msg_${i}`}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 16 }}
          renderItem={({ item }) => (
            <MessageBubble role={item.role} content={item.content} />
          )}
          onContentSizeChange={() => {
            if (activeMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-text-muted text-center">
                Send a message to get started
              </Text>
            </View>
          }
        />

        {/* Streaming text preview */}
        {isStreaming && streamingText.length > 0 && (
          <View className="px-4 pb-2">
            <View className="bg-surface-secondary rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] self-start">
              <Text className="text-text-primary text-base">{streamingText}</Text>
              <View className="w-2 h-4 bg-accent ml-0.5 mt-0.5" />
            </View>
          </View>
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          modelReady={isReady}
          onCancelGeneration={cancelGeneration}
        />
      </KeyboardAvoidingView>

      {/* Tool confirmation modal */}
      <ToolConfirmation
        visible={!!pendingConfirmation}
        toolCall={pendingConfirmation?.call ?? null}
        skillName={pendingConfirmation?.skillName ?? ''}
        onConfirm={handleConfirm}
        onDeny={handleDeny}
      />
    </SafeAreaView>
  );
}
