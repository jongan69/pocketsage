import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import type { Skill } from '@pocketsage/agent-runtime';

async function requestReminderPermission(): Promise<boolean> {
  try {
    const { status } = await Calendar.getRemindersPermissionsAsync();
    if (status === 'granted') return true;
    const { granted } = await Calendar.requestRemindersPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

export const remindersSkill: Skill = {
  metadata: {
    name: 'reminders',
    description: 'Create and manage reminders and to-do items',
    version: '0.1.0',
    keywords: ['reminder', 'remind', 'todo', 'task', 'deadline', 'due', 'remember to'],
    triggers: [
      'remind me',
      'set a reminder',
      'add a task',
      'create a to-do',
      "what's on my to-do list",
      'any reminders',
      'don\'t let me forget',
    ],
  },
  tools: {
    'reminders.list': {
      definition: {
        name: 'reminders.list',
        description: 'List reminders, optionally filtered by completion status and date range',
        parameters: {
          type: 'object',
          properties: {
            completed: {
              type: 'boolean',
              description: 'Filter by completion status (omit for all)',
            },
            startDate: {
              type: 'string',
              description: 'Earliest due date (ISO 8601, optional)',
            },
            endDate: {
              type: 'string',
              description: 'Latest due date (ISO 8601, optional)',
            },
          },
          required: [],
        },
      },
      execute: async ({ completed, startDate, endDate }) => {
        if (Platform.OS === 'android') {
          // Android uses the reminders calendar
          const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
          const reminderCal = calendars.find((c) => c.title?.toLowerCase().includes('reminder'));
          if (!reminderCal) {
            return { reminders: [], note: 'No reminders calendar found on this Android device.' };
          }
          const now = new Date();
          const start = startDate ? new Date(startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
          const end = endDate ? new Date(endDate as string) : new Date(now.getFullYear() + 1, 0, 1);
          const events = await Calendar.getEventsAsync([reminderCal.id], start, end);
          return {
            reminders: events.map((e) => ({
              id: e.id,
              title: e.title,
              dueDate: e.startDate?.toISOString() ?? null,
              completed: e.endDate && e.endDate < now,
            })),
          };
        }

        const permitted = await requestReminderPermission();
        if (!permitted) throw new Error('Reminders permission not granted.');

        const reminders = await Calendar.getRemindersAsync(
          null,
          completed as boolean | undefined,
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined,
        );

        return {
          reminders: reminders.map((r) => ({
            id: r.id,
            title: r.title,
            completed: r.completed,
            dueDate: r.dueDate?.toISOString() ?? null,
            notes: r.notes || null,
            priority: r.priority || 'normal',
          })),
        };
      },
    },

    'reminders.add': {
      definition: {
        name: 'reminders.add',
        description: 'Create a new reminder',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Reminder title' },
            notes: { type: 'string', description: 'Additional notes (optional)' },
            dueDate: { type: 'string', description: 'Due date in ISO 8601 format (optional)' },
            priority: {
              type: 'string',
              description: 'Priority level',
              enum: ['low', 'normal', 'high'],
            },
          },
          required: ['title'],
        },
        requiresConfirmation: false,
      },
      execute: async ({ title, notes, dueDate, priority }) => {
        if (Platform.OS === 'android') {
          // On Android, create as a calendar event in reminders calendar
          const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
          let reminderCal = calendars.find((c) => c.allowsModifications && c.title?.toLowerCase().includes('reminder'));
          if (!reminderCal) {
            reminderCal = calendars.find((c) => c.allowsModifications);
          }
          if (!reminderCal) throw new Error('No writable calendar found for reminders.');
          const dueDateObj = dueDate ? new Date(dueDate as string) : new Date(Date.now() + 3600000);
          const eventId = await Calendar.createEventAsync(reminderCal.id, {
            title: title as string,
            startDate: dueDateObj,
            endDate: new Date(dueDateObj.getTime() + 1800000),
            notes: (notes as string) || '',
            alarms: [{ relativeOffset: -15 }],
          });
          return { id: eventId, title, dueDate: dueDateObj.toISOString(), created: true, platform: 'android' };
        }

        const permitted = await requestReminderPermission();
        if (!permitted) throw new Error('Reminders permission not granted.');

        const dueDateObj = dueDate ? new Date(dueDate as string) : undefined;
        const reminderId = await Calendar.createReminderAsync(null, {
          title: title as string,
          notes: (notes as string) || '',
          startDate: dueDateObj,
          dueDate: dueDateObj,
        });

        return {
          id: reminderId,
          title,
          dueDate: dueDateObj?.toISOString() ?? null,
          created: true,
        };
      },
    },

    'reminders.complete': {
      definition: {
        name: 'reminders.complete',
        description: 'Mark a reminder as completed',
        parameters: {
          type: 'object',
          properties: {
            reminderId: { type: 'string', description: 'The reminder ID to complete' },
          },
          required: ['reminderId'],
        },
        requiresConfirmation: false,
      },
      execute: async ({ reminderId }) => {
        if (Platform.OS === 'android') {
          await Calendar.deleteEventAsync(reminderId as string);
          return { reminderId, completed: true };
        }
        const permitted = await requestReminderPermission();
        if (!permitted) throw new Error('Reminders permission not granted.');
        await Calendar.completeReminderAsync(reminderId as string);
        return { reminderId, completed: true };
      },
    },
  },
  instructions: '',
};
