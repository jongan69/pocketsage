import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import type { Skill } from '@pocketsage/agent-runtime';

async function getDefaultCalendar(): Promise<Calendar.Calendar> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
  if (!defaultCal) {
    throw new Error('No writable calendar found on this device. Please check your calendar permissions.');
  }
  return defaultCal;
}

async function requestPermissionIfNeeded(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status === 'granted') return true;
  const { granted } = await Calendar.requestCalendarPermissionsAsync();
  return granted;
}

export const calendarSkill: Skill = {
  metadata: {
    name: 'calendar',
    description: 'Manage calendar events and check your schedule',
    version: '0.1.0',
    keywords: ['calendar', 'schedule', 'event', 'appointment', 'meeting', 'today', 'tomorrow', 'week', 'agenda'],
    triggers: [
      'check my schedule',
      'what do I have',
      "what's on my calendar",
      'create an event',
      'add to calendar',
      'schedule a meeting',
      'what is today',
      'any appointments',
    ],
  },
  tools: {
    'calendar.list': {
      definition: {
        name: 'calendar.list',
        description: 'List calendar events in a date range. Returns event id, title, start date, end date, location, and notes.',
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date in ISO 8601 format (YYYY-MM-DD)',
            },
            endDate: {
              type: 'string',
              description: 'End date in ISO 8601 format (YYYY-MM-DD)',
            },
          },
          required: ['startDate', 'endDate'],
        },
      },
      execute: async ({ startDate, endDate }) => {
        const permitted = await requestPermissionIfNeeded();
        if (!permitted) throw new Error('Calendar permission not granted.');

        const calendar = await getDefaultCalendar();
        const events = await Calendar.getEventsAsync(
          [calendar.id],
          new Date(startDate as string),
          new Date(endDate as string),
        );

        return {
          calendar: calendar.title,
          count: events.length,
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            startDate: e.startDate.toISOString(),
            endDate: e.endDate.toISOString(),
            allDay: e.allDay,
            location: e.location || null,
            notes: e.notes || null,
          })),
        };
      },
    },

    'calendar.create': {
      definition: {
        name: 'calendar.create',
        description: 'Create a new calendar event',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            startDate: {
              type: 'string',
              description: 'Start date/time in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
            },
            endDate: {
              type: 'string',
              description: 'End date/time in ISO 8601 format',
            },
            notes: { type: 'string', description: 'Event notes or description (optional)' },
            location: { type: 'string', description: 'Event location (optional)' },
          },
          required: ['title', 'startDate', 'endDate'],
        },
        requiresConfirmation: true,
      },
      execute: async ({ title, startDate, endDate, notes, location }) => {
        const permitted = await requestPermissionIfNeeded();
        if (!permitted) throw new Error('Calendar permission not granted.');

        const calendar = await getDefaultCalendar();
        const eventId = await Calendar.createEventAsync(calendar.id, {
          title: title as string,
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
          notes: (notes as string) || '',
          location: (location as string) || '',
          timeZone: Calendar.EntityTypes.EVENT ? undefined : undefined,
        });

        return {
          eventId,
          title,
          startDate,
          endDate,
          created: true,
        };
      },
    },

    'calendar.delete': {
      definition: {
        name: 'calendar.delete',
        description: 'Delete a calendar event by its ID',
        parameters: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'The event ID to delete' },
          },
          required: ['eventId'],
        },
        requiresConfirmation: true,
      },
      execute: async ({ eventId }) => {
        const permitted = await requestPermissionIfNeeded();
        if (!permitted) throw new Error('Calendar permission not granted.');

        await Calendar.deleteEventAsync(eventId as string, {
          futureEvents: false,
        });

        return { eventId, deleted: true };
      },
    },
  },
  instructions: '',
};
