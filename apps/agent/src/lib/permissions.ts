import { Platform } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

async function checkExpoPermission(
  getAsync: () => Promise<{ status: string; granted: boolean }>,
  requestAsync: () => Promise<{ status: string; granted: boolean }>,
): Promise<PermissionStatus> {
  try {
    const { status, granted } = await getAsync();
    if (granted) return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

async function requestExpoPermission(
  getAsync: () => Promise<{ status: string; granted: boolean }>,
  requestAsync: () => Promise<{ status: string; granted: boolean }>,
): Promise<PermissionStatus> {
  try {
    // Check current first
    const { status: currentStatus, granted: currentGranted } = await getAsync();
    if (currentGranted) return 'granted';
    if (currentStatus === 'denied') return 'denied';

    // Request
    const { granted } = await requestAsync();
    return granted ? 'granted' : 'denied';
  } catch {
    return 'undetermined';
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────

let calendarModule: typeof import('expo-calendar') | null = null;
async function getCalendarModule() {
  if (!calendarModule) {
    try {
      calendarModule = await import('expo-calendar');
    } catch {
      return null;
    }
  }
  return calendarModule;
}

export async function checkCalendarPermission(): Promise<PermissionStatus> {
  const mod = await getCalendarModule();
  if (!mod) return 'undetermined';
  return checkExpoPermission(
    () => mod.getCalendarPermissionsAsync(),
    () => mod.requestCalendarPermissionsAsync(),
  );
}

export async function requestCalendarPermission(): Promise<PermissionStatus> {
  const mod = await getCalendarModule();
  if (!mod) return 'undetermined';
  return requestExpoPermission(
    () => mod.getCalendarPermissionsAsync(),
    () => mod.requestCalendarPermissionsAsync(),
  );
}

export async function checkRemindersPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'ios') return 'granted'; // Android uses calendar permission
  const mod = await getCalendarModule();
  if (!mod) return 'undetermined';
  return checkExpoPermission(
    () => mod.getRemindersPermissionsAsync(),
    () => mod.requestRemindersPermissionsAsync(),
  );
}

export async function requestRemindersPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'ios') return 'granted';
  const mod = await getCalendarModule();
  if (!mod) return 'undetermined';
  return requestExpoPermission(
    () => mod.getRemindersPermissionsAsync(),
    () => mod.requestRemindersPermissionsAsync(),
  );
}

// ── Contacts ──────────────────────────────────────────────────────────────────

let contactsModule: typeof import('expo-contacts') | null = null;
async function getContactsModule() {
  if (!contactsModule) {
    try {
      contactsModule = await import('expo-contacts');
    } catch {
      return null;
    }
  }
  return contactsModule;
}

export async function checkContactsPermission(): Promise<PermissionStatus> {
  const mod = await getContactsModule();
  if (!mod) return 'undetermined';
  return checkExpoPermission(
    () => mod.getPermissionsAsync(),
    () => mod.requestPermissionsAsync(),
  );
}

export async function requestContactsPermission(): Promise<PermissionStatus> {
  const mod = await getContactsModule();
  if (!mod) return 'undetermined';
  return requestExpoPermission(
    () => mod.getPermissionsAsync(),
    () => mod.requestPermissionsAsync(),
  );
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkHealthPermission(): Promise<PermissionStatus> {
  // Health requires native module — gracefully degrade
  if (Platform.OS === 'ios') {
    try {
      const HealthKit = require('@kingstinct/react-native-healthkit');
      const isAvailable = HealthKit?.isHealthKitAvailable?.() ?? false;
      if (!isAvailable) return 'undetermined';
      // HealthKit permissions are per-data-type, requested at query time
      return 'undetermined';
    } catch {
      return 'undetermined';
    }
  }
  // Android Health Connect — check availability
  if (Platform.OS === 'android') {
    try {
      const HealthConnect = require('react-native-health-connect');
      const isAvailable = HealthConnect?.isAvailable?.() ?? false;
      return isAvailable ? 'undetermined' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'denied';
}

export async function requestHealthPermission(): Promise<PermissionStatus> {
  // Health permissions are requested per-metric at query time
  // This just checks availability
  return checkHealthPermission();
}

// ── Generic ───────────────────────────────────────────────────────────────────

export type PermissionType = 'calendar' | 'reminders' | 'contacts' | 'health';

export async function requestPermission(type: PermissionType): Promise<PermissionStatus> {
  switch (type) {
    case 'calendar':
      return requestCalendarPermission();
    case 'reminders':
      return requestRemindersPermission();
    case 'contacts':
      return requestContactsPermission();
    case 'health':
      return requestHealthPermission();
    default:
      return 'denied';
  }
}
