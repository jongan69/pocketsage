import React, { useState } from 'react';
import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { Send, Square, Download } from 'lucide-react-native';

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  modelReady: boolean;
  onCancelGeneration: () => void;
}

export const ChatInput = React.memo(function ChatInput({
  onSend,
  isStreaming,
  modelReady,
  onCancelGeneration,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setText('');
    onSend(trimmed);
  };

  if (!modelReady) {
    return (
      <View className="px-4 py-3 border-t border-surface-tertiary">
        <View className="bg-surface-tertiary rounded-full px-5 py-3 items-center">
          <View className="flex-row items-center">
            <Download size={16} color="#6366f1" />
            <TextInput
              className="text-text-muted text-sm ml-2"
              editable={false}
              value="Download a model in Settings to get started"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="px-4 py-3 border-t border-surface-tertiary bg-surface">
      <View className="flex-row items-end">
        <TextInput
          className="flex-1 bg-surface-tertiary rounded-full px-5 py-3 text-text-primary text-base max-h-32"
          value={text}
          onChangeText={setText}
          placeholder="Ask PocketSage..."
          placeholderTextColor="#525252"
          multiline
          editable={!isStreaming}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="send"
        />
        <Pressable
          onPress={isStreaming ? onCancelGeneration : handleSend}
          disabled={!isStreaming && text.trim().length === 0}
          className={`ml-3 w-11 h-11 rounded-full items-center justify-center ${
            isStreaming
              ? 'bg-danger'
              : text.trim().length > 0
                ? 'bg-accent'
                : 'bg-surface-tertiary'
          }`}
        >
          {isStreaming ? (
            <Square size={18} color="#fff" />
          ) : (
            <Send size={18} color={text.trim().length > 0 ? '#fff' : '#525252'} />
          )}
        </Pressable>
      </View>
    </View>
  );
});
