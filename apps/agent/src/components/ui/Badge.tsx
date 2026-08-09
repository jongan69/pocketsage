import { memo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const backgroundStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-tertiary',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  danger: 'bg-danger/10',
};

const textStyles: Record<BadgeVariant, string> = {
  default: 'text-text-secondary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** Small pill used for status indicators. */
export const Badge = memo(function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <View className={cn('rounded-full px-2 py-0.5', backgroundStyles[variant], className)}>
      <Text className={cn('text-xs font-medium', textStyles[variant])}>{children}</Text>
    </View>
  );
});

export type { BadgeVariant };
