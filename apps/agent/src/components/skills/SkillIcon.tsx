import type { ComponentType } from 'react';
import { Calendar, Bell, Heart, File, User, Puzzle } from 'lucide-react-native';

export type LucideIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Icons per bundled skill, keyed by metadata.name. Falls back to Puzzle. */
const SKILL_ICONS: Record<string, LucideIcon> = {
  calendar: Calendar,
  reminders: Bell,
  health: Heart,
  files: File,
  contacts: User,
};

/**
 * Accent colors per skill, drawn from the theme palette. Used for icon fills
 * (lucide icons take a `color` prop, so hex tokens live here only).
 */
const SKILL_COLORS: Record<string, string> = {
  calendar: '#6366f1', // accent
  reminders: '#f59e0b', // warning
  health: '#22c55e', // success
  files: '#4338ca', // accent-muted
  contacts: '#a3a3a3', // text-secondary
};

/** Human-readable display name for a skill, e.g. "calendar" → "Calendar". */
export function skillDisplayName(name: string): string {
  const map: Record<string, string> = {
    calendar: 'Calendar',
    reminders: 'Reminders',
    health: 'Health',
    files: 'Files',
    contacts: 'Contacts',
  };
  return map[name] ?? (name.charAt(0).toUpperCase() + name.slice(1));
}

export function skillIconFor(name: string): LucideIcon {
  return SKILL_ICONS[name] ?? Puzzle;
}

export function skillColorFor(name: string): string {
  return SKILL_COLORS[name] ?? '#6366f1';
}
