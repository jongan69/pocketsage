import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, History, X, Trash2, AlertTriangle } from 'lucide-react-native';
import { useConversationStore } from '@/stores/conversation-store';
import { useModelStore } from '@/stores/model-store';
import { useAgent } from '@/hooks/useAgent';
import { useModels } from '@/hooks/useModels';
import { SUGGESTED_PROMPTS } from '@/lib/constants';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { ToolConfirmation } from './ToolConfirmation';
import { StreamingText } from './StreamingText';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { ModelPicker } from '@/components/models/ModelPicker';

const GREETING_PROMPTS = SUGGESTED_PROMPTS.slice(0, 3);

/** The active conversation: loading / error / empty / streaming states. */
export function ChatScreen() {
  const conversation = useConversationStore();
  const modelStore = useModelStore();
  const {
    sendMessage,
    cancelGeneration,
    isStreaming,
    pendingToolConfirmation,
    resolveToolConfirmation,
  } = useAgent();
  const { isReady, isInitialized, initError } = useModels();
  const flatListRef = useRef<FlatList>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const activeMessages = conversation.activeMessages();
  const streamingText = conversation.streamingText;

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleConfirm = useCallback(() => {
    resolveToolConfirmation('approve');
  }, [resolveToolConfirmation]);

  const handleDeny = useCallback(() => {
    resolveToolConfirmation('deny');
  }, [resolveToolConfirmation]);

  const handleRetryInit = useCallback(() => {
    void modelStore.initialize();
  }, [modelStore]);

  const handleOpenHistory = useCallback(() => {
    setHistoryVisible(true);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      conversation.setActiveConversation(id);
      setHistoryVisible(false);
    },
    [conversation],
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!isInitialized && activeMessages.length === 0) {
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

  // ── Error state ────────────────────────────────────────────────────────────
  if (isInitialized && !isReady && activeMessages.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <View className="w-14 h-14 rounded-2xl bg-danger/10 items-center justify-center mb-4">
          <AlertTriangle size={26} color="#ef4444" />
        </View>
        <Text className="text-text-primary text-base font-semibold text-center">
          AI unavailable — check your model in Settings
        </Text>
        {initError && (
          <Text className="text-text-muted text-xs text-center mt-1">{initError}</Text>
        )}
        <View className="flex-row gap-3 mt-5">
          <Button variant="secondary" onPress={handleRetryInit}>
            Retry
          </Button>
          <Button variant="primary" onPress={() => setPickerVisible(true)}>
            Choose a model
          </Button>
        </View>
        <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View className="px-4 py-3 border-b border-surface-tertiary flex-row items-center">
          <View className="w-8 h-8 bg-accent/20 rounded-lg items-center justify-center mr-3">
            <Sparkles size={16} color="#6366f1" />
          </View>
          <View className="flex-1">
            <Text className="text-text-primary font-semibold text-base">PocketSage</Text>
            <Text className="text-text-muted text-xs">
              {isStreaming ? 'Thinking...' : 'On-device'}
            </Text>
          </View>
          <Pressable
            onPress={handleOpenHistory}
            accessibilityLabel="Conversation history"
            className="p-2"
          >
            <History size={20} color="#a3a3a3" />
          </Pressable>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={activeMessages}
          keyExtractor={(_, i) => `msg_${i}`}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleOpenHistory}
              tintColor="#6366f1"
              colors={['#6366f1']}
              progressBackgroundColor="#141414"
            />
          }
          renderItem={({ item }) => (
            <MessageBubble
              role={item.role}
              content={item.content}
              isStreaming={item.role === 'assistant' && isStreaming}
              name={item.name}
            />
          )}
          onContentSizeChange={() => {
            if (activeMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListEmptyComponent={<EmptyChat onPrompt={handleSend} />}
        />

        {/* Streaming text preview */}
        {isStreaming && streamingText.length > 0 && (
          <View className="px-4 pb-2">
            <View className="bg-surface-secondary rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] self-start">
              <StreamingText text={streamingText} isStreaming />
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
        visible={!!pendingToolConfirmation}
        toolCall={pendingToolConfirmation?.call ?? null}
        skillName={pendingToolConfirmation?.skillName ?? ''}
        onConfirm={handleConfirm}
        onDeny={handleDeny}
      />

      {/* History modal */}
      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        onSelect={handleSelectConversation}
      />
    </SafeAreaView>
  );
}

interface EmptyChatProps {
  onPrompt: (text: string) => void;
}

function EmptyChat({ onPrompt }: EmptyChatProps) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-16 h-16 rounded-2xl bg-accent/20 items-center justify-center mb-5">
        <Sparkles size={30} color="#6366f1" />
      </View>
      <Text className="text-text-primary text-2xl font-bold text-center">
        Hi, I'm PocketSage
      </Text>
      <Text className="text-text-secondary text-base text-center mt-2 leading-relaxed">
        I run entirely on this phone. Ask me anything.
      </Text>

      <View className="flex-row flex-wrap justify-center gap-2 mt-7">
        {GREETING_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => onPrompt(prompt)}
            accessibilityRole="button"
            className="bg-surface-secondary border border-surface-tertiary rounded-full px-4 py-2.5 active:opacity-80"
          >
            <Text className="text-text-secondary text-sm">{prompt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

function HistoryModal({ visible, onClose, onSelect }: HistoryModalProps) {
  const { conversations, deleteConversation } = useConversationStore();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/70 justify-end">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close history" />

        <View className="bg-surface-secondary rounded-t-3xl px-4 pt-4 pb-8 max-h-[70%]">
          <View className="flex-row items-center justify-between px-2 mb-3">
            <Text className="text-text-primary text-lg font-bold">Conversations</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" className="p-2 -mr-2">
              <X size={20} color="#a3a3a3" />
            </Pressable>
          </View>

          {conversations.length === 0 ? (
            <Text className="text-text-muted text-sm text-center py-8">
              No past conversations yet
            </Text>
          ) : (
            <ScrollView className="flex-grow-0">
              {conversations.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => onSelect(c.id)}
                  accessibilityRole="button"
                  className="bg-surface rounded-xl px-4 py-3 mb-2 flex-row items-center"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-text-primary text-sm font-medium" numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text className="text-text-muted text-xs mt-0.5">
                      {new Date(c.updatedAt).toLocaleDateString()} · {c.messages.length}{' '}
                      {c.messages.length === 1 ? 'message' : 'messages'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => deleteConversation(c.id)}
                    accessibilityLabel="Delete conversation"
                    hitSlop={8}
                    className="p-1"
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
