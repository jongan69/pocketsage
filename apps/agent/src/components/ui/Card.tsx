import React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  onPress?: () => void;
  children: React.ReactNode;
}

export const Card = React.memo(function Card({ onPress, children, className, ...props }: CardProps) {
  const content = (
    <View
      {...props}
      className={`bg-surface-secondary rounded-xl p-4 ${className ?? ''}`}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        {content}
      </Pressable>
    );
  }

  return content;
});
