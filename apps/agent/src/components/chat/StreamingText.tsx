import React, { useEffect, useRef } from 'react';
import { Text, View, Animated, Easing } from 'react-native';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

/** Streaming assistant text with **bold**, `code`, and a blinking cursor. */
export const StreamingText = React.memo(function StreamingText({
  text,
  isStreaming,
}: StreamingTextProps) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isStreaming) {
      cursorOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 450,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      cursorOpacity.setValue(1);
    };
  }, [isStreaming, cursorOpacity]);

  const segments = parseMarkdownInline(text);

  return (
    <View className="flex-row flex-wrap items-center">
      {segments.map((seg, i) => {
        let className = 'text-text-primary';
        if (seg.bold) className += ' font-bold';
        if (seg.code) className += ' font-mono text-xs bg-surface-tertiary rounded px-1';

        return (
          <Text key={i} className={className}>
            {seg.text}
          </Text>
        );
      })}
      {isStreaming && (
        <Animated.View
          style={{ opacity: cursorOpacity }}
          className="w-0.5 h-4 bg-accent ml-0.5"
        />
      )}
    </View>
  );
});

interface TextSegment {
  text: string;
  bold: boolean;
  code: boolean;
}

function parseMarkdownInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;
  let bold = false;
  let code = false;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/s);
    const codeMatch = remaining.match(/^(.*?)`(.+?)`/s);

    if (boldMatch && (!codeMatch || boldMatch.index! <= codeMatch.index!)) {
      if (boldMatch[1]) segments.push({ text: boldMatch[1], bold: false, code: false });
      segments.push({ text: boldMatch[2], bold: true, code: false });
      remaining = remaining.slice(boldMatch[0].length);
    } else if (codeMatch) {
      if (codeMatch[1]) segments.push({ text: codeMatch[1], bold: false, code: false });
      segments.push({ text: codeMatch[2], bold: false, code: true });
      remaining = remaining.slice(codeMatch[0].length);
    } else {
      segments.push({ text: remaining, bold: false, code: false });
      remaining = '';
    }
  }

  return segments.length > 0 ? segments : [{ text, bold: false, code: false }];
}
