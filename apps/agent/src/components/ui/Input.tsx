import React, { useState } from 'react';
import { TextInput, Text, View, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = React.memo(function Input({
  label,
  error,
  helper,
  className,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="mb-3">
      {label && (
        <Text className="text-text-secondary text-sm font-medium mb-1.5 ml-1">
          {label}
        </Text>
      )}
      <TextInput
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        placeholderTextColor="#525252"
        className={`bg-surface-tertiary rounded-lg px-4 py-2.5 text-text-primary text-base ${focused ? 'border border-accent' : 'border border-transparent'} ${className ?? ''}`}
      />
      {error ? (
        <Text className="text-danger text-xs mt-1 ml-1">{error}</Text>
      ) : helper ? (
        <Text className="text-text-muted text-xs mt-1 ml-1">{helper}</Text>
      ) : null}
    </View>
  );
});
