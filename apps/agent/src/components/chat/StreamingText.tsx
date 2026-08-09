import React from 'react';
import { Text, View } from 'react-native';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export const StreamingText = React.memo(function StreamingText({
  text,
  isStreaming,
}: StreamingTextProps) {
  // Simple parsing for bold and code
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
        <Text className="text-accent font-bold ml-0.5">|</Text>
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
