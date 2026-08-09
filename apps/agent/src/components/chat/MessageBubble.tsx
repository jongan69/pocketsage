import React from 'react';
import { View, Text } from 'react-native';
import { Bot, User, Wrench } from 'lucide-react-native';
import { StreamingText } from './StreamingText';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  isStreaming?: boolean;
  /** Tool name shown in the tool bubble header (defaults to "Tool result"). */
  name?: string;
}

export const MessageBubble = React.memo(function MessageBubble({
  role,
  content,
  isStreaming,
  name,
}: MessageBubbleProps) {
  if (role === 'system') return null;

  if (role === 'tool') {
    return (
      <View className="mb-3 ml-2">
        <View className="flex-row items-center mb-1">
          <Wrench size={12} color="#6366f1" />
          <Text className="text-accent text-xs font-bold ml-1" numberOfLines={1}>
            {name ?? 'Tool result'}
          </Text>
        </View>
        <View className="bg-surface-tertiary border-l-2 border-accent-muted rounded-r-lg px-3 py-2 max-w-[90%]">
          <Text className="text-text-secondary text-xs font-mono" numberOfLines={5}>
            {content.length > 300 ? content.slice(0, 300) + '...' : content}
          </Text>
        </View>
      </View>
    );
  }

  const isUser = role === 'user';

  return (
    <View className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Label */}
      <View className={`flex-row items-center mb-1 ${isUser ? 'justify-end' : 'justify-start'} px-1`}>
        {isUser ? (
          <>
            <Text className="text-text-muted text-xs mr-1">You</Text>
            <User size={12} color="#525252" />
          </>
        ) : (
          <>
            <Bot size={12} color="#6366f1" />
            <Text className="text-accent text-xs ml-1">PocketSage</Text>
          </>
        )}
      </View>

      {/* Bubble */}
      <View
        className={`rounded-2xl px-4 py-3 max-w-[85%] ${
          isUser ? 'bg-accent rounded-tr-sm' : 'bg-surface-secondary rounded-tl-sm'
        }`}
      >
        {!isUser && isStreaming ? (
          <StreamingText text={content} isStreaming />
        ) : (
          <Text
            className={`text-base leading-relaxed ${isUser ? 'text-white' : 'text-text-primary'}`}
            selectable
          >
            {content}
          </Text>
        )}
      </View>
    </View>
  );
});
