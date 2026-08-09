import { Platform } from 'react-native';
import type { Skill } from '@pocketsage/agent-runtime';

type HealthMetric = 'steps' | 'heart_rate' | 'sleep' | 'workouts' | 'weight';

interface HealthQueryParams {
  metric: HealthMetric;
  startDate: string;
  endDate: string;
}

async function queryAppleHealth(
  metric: HealthMetric,
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>> {
  try {
    const HealthKit = require('@kingstinct/react-native-healthkit');
    const isAvailable = HealthKit?.isHealthKitAvailable?.() ?? false;
    if (!isAvailable) {
      return { available: false, reason: 'HealthKit not available on this device' };
    }

    switch (metric) {
      case 'steps': {
        const samples = await HealthKit.queryQuantitySamples('stepCount', {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        });
        const total = (samples ?? []).reduce((sum: number, s: { quantity: number }) => sum + (s.quantity ?? 0), 0);
        return { metric: 'steps', total, unit: 'steps', samples: (samples ?? []).length };
      }

      case 'heart_rate': {
        const samples = await HealthKit.queryQuantitySamples('heartRate', {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        });
        const values = (samples ?? []).map((s: { quantity: number }) => s.quantity);
        const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
        const min = values.length > 0 ? Math.min(...values) : 0;
        const max = values.length > 0 ? Math.max(...values) : 0;
        return { metric: 'heart_rate', average: Math.round(avg), min, max, unit: 'bpm', readings: values.length };
      }

      case 'sleep': {
        const samples = await HealthKit.queryCategorySamples('sleepAnalysis', {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        });
        let totalMinutes = 0;
        for (const s of samples ?? []) {
          const dur = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
          if (s.value === 'ASLEEP' || s.value === 'IN_BED') {
            totalMinutes += dur;
          }
        }
        return {
          metric: 'sleep',
          totalMinutes: Math.round(totalMinutes),
          totalHours: +(totalMinutes / 60).toFixed(1),
          samples: (samples ?? []).length,
        };
      }

      case 'workouts': {
        const samples = await HealthKit.queryWorkoutSamples({
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        });
        return {
          metric: 'workouts',
          count: (samples ?? []).length,
          workouts: (samples ?? []).map((w: { workoutActivityType: string; duration: number; totalEnergyBurned?: number }) => ({
            type: w.workoutActivityType,
            durationMinutes: Math.round((w.duration ?? 0) / 60),
            calories: w.totalEnergyBurned ?? null,
          })),
        };
      }

      case 'weight': {
        const samples = await HealthKit.queryQuantitySamples('bodyMass', {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        });
        const values = (samples ?? []).map((s: { quantity: number }) => s.quantity);
        const latest = values.length > 0 ? values[values.length - 1] : null;
        return {
          metric: 'weight',
          latest: latest ? +latest.toFixed(1) : null,
          unit: 'kg',
          readings: values.length,
        };
      }

      default:
        return { error: `Unknown metric: ${metric}` };
    }
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : 'Health query failed' };
  }
}

async function queryAndroidHealth(
  metric: HealthMetric,
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>> {
  try {
    const HealthConnect = require('react-native-health-connect');
    const isAvailable = HealthConnect?.isAvailable?.() ?? false;
    if (!isAvailable) {
      return { available: false, reason: 'Health Connect not available' };
    }

    switch (metric) {
      case 'steps': {
        const result = await HealthConnect.readRecords('Steps', {
          timeRangeFilter: { startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        });
        const total = (result?.records ?? []).reduce((sum: number, r: { count: number }) => sum + (r.count ?? 0), 0);
        return { metric: 'steps', total, unit: 'steps' };
      }

      case 'heart_rate': {
        const result = await HealthConnect.readRecords('HeartRate', {
          timeRangeFilter: { startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        });
        const samples = result?.records ?? [];
        const values = samples.map((r: { beatsPerMinute: number }) => r.beatsPerMinute);
        const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
        const min = values.length > 0 ? Math.min(...values) : 0;
        const max = values.length > 0 ? Math.max(...values) : 0;
        return { metric: 'heart_rate', average: Math.round(avg), min, max, unit: 'bpm', readings: values.length };
      }

      case 'sleep': {
        const result = await HealthConnect.readRecords('SleepSession', {
          timeRangeFilter: { startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        });
        let totalMinutes = 0;
        for (const s of result?.records ?? []) {
          const dur = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000;
          totalMinutes += dur;
        }
        return {
          metric: 'sleep',
          totalMinutes: Math.round(totalMinutes),
          totalHours: +(totalMinutes / 60).toFixed(1),
        };
      }

      case 'weight': {
        const result = await HealthConnect.readRecords('Weight', {
          timeRangeFilter: { startTime: startDate.toISOString(), endTime: endDate.toISOString() },
          ascendingOrder: false,
          pageSize: 1,
        });
        const latest = result?.records?.[0];
        return {
          metric: 'weight',
          latest: latest?.weight?.inKilograms ? +latest.weight.inKilograms.toFixed(1) : null,
          unit: 'kg',
        };
      }

      default:
        return {
          metric,
          total: 0,
          note: `${metric} data available but detailed parsing not yet implemented for Android`,
        };
    }
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : 'Health query failed' };
  }
}

export const healthSkill: Skill = {
  metadata: {
    name: 'health',
    description: 'Read health and fitness data (steps, heart rate, sleep, workouts, weight)',
    version: '0.1.0',
    keywords: [
      'health',
      'fitness',
      'steps',
      'heart',
      'sleep',
      'workout',
      'exercise',
      'weight',
      'activity',
      'calories',
    ],
    triggers: [
      'how many steps',
      'my heart rate',
      'how did I sleep',
      'my workouts',
      'how much do I weigh',
      'health data',
      'fitness stats',
      'activity today',
    ],
  },
  tools: {
    'health.query': {
      definition: {
        name: 'health.query',
        description: 'Query on-device health data for a specific metric over a date range',
        parameters: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              description: 'The health metric to query',
              enum: ['steps', 'heart_rate', 'sleep', 'workouts', 'weight'],
            },
            startDate: {
              type: 'string',
              description: 'Start date (ISO 8601)',
            },
            endDate: {
              type: 'string',
              description: 'End date (ISO 8601)',
            },
          },
          required: ['metric', 'startDate', 'endDate'],
        },
        requiresConfirmation: false,
      },
      execute: async (args) => {
        const { metric, startDate, endDate } = args as unknown as HealthQueryParams;
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new Error('Invalid date format. Use ISO 8601 (YYYY-MM-DD).');
        }

        if (Platform.OS === 'ios') {
          return queryAppleHealth(metric, start, end);
        }

        if (Platform.OS === 'android') {
          return queryAndroidHealth(metric, start, end);
        }

        return { available: false, reason: 'Health data not supported on this platform' };
      },
    },
  },
  instructions: '',
};
