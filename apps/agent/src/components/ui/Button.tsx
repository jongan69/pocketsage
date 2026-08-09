import React from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent active:bg-accent-muted',
  secondary: 'bg-surface-tertiary active:bg-surface-secondary',
  ghost: 'bg-transparent active:bg-surface-tertiary',
  danger: 'bg-danger active:bg-red-700',
};

const textVariantClasses: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-text-secondary',
  ghost: 'text-accent',
  danger: 'text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'py-1.5 px-3',
  md: 'py-2.5 px-5',
  lg: 'py-3.5 px-7',
};

const textSizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export const Button = React.memo(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-xl ${variantClasses[variant]} ${sizeClasses[size]} ${isDisabled ? 'opacity-40' : ''} ${className ?? ''}`}
    >
      {loading ? (
        <Spinner size="small" className="mr-2" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 16 : 20} color={variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? '#6366f1' : '#a3a3a3'} className="mr-2" />
      ) : null}
      <Text
        className={`font-semibold ${textVariantClasses[variant]} ${textSizeClasses[size]}`}
      >
        {children}
      </Text>
    </Pressable>
  );
});
