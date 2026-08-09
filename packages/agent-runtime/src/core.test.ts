/**
 * Runtime tests for the pure-TS core of @pocketsage/agent-runtime.
 *
 * Only modules that are free of expo/react-native imports are exercised here
 * (parser, prompts, catalog, queue) so the suite runs in plain bun without a
 * device or native modules.
 */
import { describe, expect, test } from 'bun:test';

import { parseToolCalls, extractJson, validateJsonSchema } from './inference/parser';
import { buildSystemPrompt } from './inference/prompts';
import { getModelForRamBudget, getRecommendedModel } from './models/catalog';
import { enqueueGeneration, resetGenerationQueue } from './inference/queue';

// ── parseToolCalls ─────────────────────────────────────────────────────────────

describe('parseToolCalls', () => {
  test('code-fenced single call', () => {
    const calls = parseToolCalls(
      'Here you go:\n```json\n{"tool": "calendar.list", "arguments": {"date": "2026-08-09"}}\n```',
    );
    expect(calls?.length).toBe(1);
    expect(calls?.[0].name).toBe('calendar.list');
    expect(calls?.[0].arguments).toEqual({ date: '2026-08-09' });
    expect(calls?.[0].id.startsWith('tc_')).toBe(true);
  });

  test('code-fenced array', () => {
    const calls = parseToolCalls(
      '```json\n[{"tool":"a.x","arguments":{"n":1}},{"tool":"b.y","arguments":{"m":2}}]\n```',
    );
    expect(calls?.map((c) => c.name)).toEqual(['a.x', 'b.y']);
  });

  test('bare JSON amid prose', () => {
    const calls = parseToolCalls(
      'I will check your calendar. {"tool": "calendar.list", "arguments": {"date": "today"}} Let me see...',
    );
    expect(calls?.length).toBe(1);
    expect(calls?.[0].name).toBe('calendar.list');
  });

  test('function-call style', () => {
    const calls = parseToolCalls(
      'Let me look that up: reminders.add({"title": "Buy milk", "when": "tomorrow"})',
    );
    expect(calls?.length).toBe(1);
    expect(calls?.[0].name).toBe('reminders.add');
    expect(calls?.[0].arguments).toEqual({ title: 'Buy milk', when: 'tomorrow' });
  });

  test('nested braces and escaped strings', () => {
    const calls = parseToolCalls(
      '{"tool": "files.write", "arguments": {"path": "a{b}c", "content": "say \\"hi\\" {x}"}}',
    );
    expect(calls?.length).toBe(1);
    expect(calls?.[0].arguments).toEqual({ path: 'a{b}c', content: 'say "hi" {x}' });
  });

  test('plain answer returns null', () => {
    expect(parseToolCalls('I can help you with that. The weather looks nice.')).toBeNull();
    expect(parseToolCalls('')).toBeNull();
  });

  test('tool without arguments is rejected', () => {
    expect(parseToolCalls('{"tool": "x.y"}')).toBeNull();
  });

  test('multiple function calls in sequence', () => {
    const calls = parseToolCalls('First: calendar.list({}). Then: contacts.search({"q": "j"})');
    expect(calls?.map((c) => c.name)).toEqual(['calendar.list', 'contacts.search']);
  });
});

// ── extractJson ────────────────────────────────────────────────────────────────

describe('extractJson', () => {
  test('extracts objects and arrays amid prose', () => {
    expect(extractJson('prefix {"a": 1} suffix')).toEqual({ a: 1 });
    expect(extractJson('x [1, 2, {"k": "v"}] y')).toEqual([1, 2, { k: 'v' }]);
  });

  test('handles nested strings with braces and escapes', () => {
    expect(extractJson('{"s": "a } b \\" c"}')).toEqual({ s: 'a } b " c' });
  });

  test('returns null for missing or invalid JSON', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('{oops}')).toBeNull();
  });
});

// ── validateJsonSchema ─────────────────────────────────────────────────────────

describe('validateJsonSchema', () => {
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The title' },
      priority: { type: 'number', enum: [1, 2, 3] },
      done: { type: 'boolean' },
    },
    required: ['title'],
  };

  test('accepts valid values', () => {
    expect(validateJsonSchema({ title: 'x', priority: 2, done: false }, schema)).toBeNull();
  });

  test('rejects missing required fields', () => {
    expect(validateJsonSchema({ priority: 2 }, schema)).toBe('Missing required field "title".');
  });

  test('rejects wrong types', () => {
    expect(validateJsonSchema({ title: 5 }, schema)).toBe('Field "title" must be a string.');
  });

  test('rejects enum violations', () => {
    expect(validateJsonSchema({ title: 'x', priority: 9 }, schema)).toBe(
      'Field "priority" must be one of: 1, 2, 3.',
    );
  });

  test('rejects non-objects', () => {
    expect(validateJsonSchema('nope', schema)).toBe('Expected a JSON object.');
  });

  test('supports the shorthand field-map form', () => {
    expect(
      validateJsonSchema({ name: 'a', age: 30 }, { name: 'string', age: 'number' }),
    ).toBeNull();
    expect(validateJsonSchema({ name: 5 }, { name: 'string' })).toBe(
      'Field "name" must be a string.',
    );
  });
});

// ── buildSystemPrompt ──────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  test('includes identity, date, skills, memories, and format', () => {
    const prompt = buildSystemPrompt({
      activeSkills: [
        {
          name: 'calendar',
          description: 'Manage calendar events',
          version: '1.0.0',
          keywords: [],
          triggers: ['calendar', 'schedule'],
        },
      ],
      memories: ['User prefers meetings in the morning.'],
      date: new Date('2026-08-09T12:00:00Z'),
    });
    expect(prompt.includes('You are PocketSage, an on-device AI assistant.')).toBe(true);
    expect(prompt.includes('Today is 2026-08-09.')).toBe(true);
    expect(prompt.includes('calendar')).toBe(true);
    expect(prompt.includes('User prefers meetings in the morning.')).toBe(true);
    expect(prompt.includes('"tool": "skill.toolName"')).toBe(true);
  });

  test('says tools are unavailable when no skills are active', () => {
    const prompt = buildSystemPrompt({ activeSkills: [], memories: [] });
    expect(prompt.includes('You have no tools available this turn.')).toBe(true);
  });
});

// ── catalog ────────────────────────────────────────────────────────────────────

describe('model catalog', () => {
  test('selects models by RAM budget', () => {
    expect(getModelForRamBudget(2 * 1024 ** 3)).toBeNull();
    expect(getModelForRamBudget(4 * 1024 ** 3)?.tier).toBe('fast');
    expect(getModelForRamBudget(8 * 1024 ** 3)?.tier).toBe('balanced');
  });

  test('recommends the fast tier in a default environment', () => {
    expect(getRecommendedModel()?.tier).toBe('fast');
  });
});

// ── enqueueGeneration (single-flight) ──────────────────────────────────────────

describe('enqueueGeneration', () => {
  test('serializes work and preserves results in order', async () => {
    resetGenerationQueue();
    const order: string[] = [];
    const results = await Promise.all([
      enqueueGeneration(async () => {
        order.push('a-start');
        await new Promise((resolve) => setTimeout(resolve, 40));
        order.push('a-end');
        return 'A';
      }),
      enqueueGeneration(async () => {
        order.push('b');
        return 'B';
      }),
      enqueueGeneration(async () => {
        order.push('c');
        return 'C';
      }),
    ]);
    expect(results).toEqual(['A', 'B', 'C']);
    expect(order).toEqual(['a-start', 'a-end', 'b', 'c']);
  });

  test('releases the queue even when work throws', async () => {
    resetGenerationQueue();
    await expect(enqueueGeneration(async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(enqueueGeneration(async () => 'ok')).resolves.toBe('ok');
  });
});
