import React from 'react';
import { ActivityIndicator } from 'react-native';

interface SpinnerProps {
  size?: 'small' | 'large';
  className?: string;
}

export const Spinner = React.memo(function Spinner({ size = 'small', className }: SpinnerProps) {
  return <ActivityIndicator size={size} color="#6366f1" className={className} />;
});
