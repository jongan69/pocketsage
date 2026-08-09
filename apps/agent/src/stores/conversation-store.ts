import { create } from 'zustand';
import * as SQLite from 'expo-sqlite';
import type { Message, ToolCall, ToolResult } from '@pocketsage/agent-runtime';
import { uuid } from '@/lib/uuid';
import { MAX_FREE_CONVERSATIONS } from '@/lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  /** First user message, truncated to 50 chars. */
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingToolConfirmation {
  call: ToolCall;
  skillName: string;
}

interface ConversationRow {
  id: string;
  title: string;
  messages_json: string;
  created_at: number;
  updated_at: number;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
  streamingText: string;
  pendingToolConfirmation: PendingToolConfirmation | null;
  /**
   * The user's decision for the most recent confirmation. `null` means the
   * pending state was cleared without an explicit decision (the UI treated
   * the dismissal as approval).
   */
  lastConfirmationDecision: 'approve' | 'deny' | null;

  // Actions
  initialize: () => Promise<void>;
  createConversation: () => string; // returns the new conversation ID
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string) => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  appendStreamingToken: (token: string) => void;
  setStreamingText: (content: string) => void;
  finalizeStreaming: (content: string) => void;
  addToolCall: (call: ToolCall) => void;
  addToolResult: (result: ToolResult) => void;
  requestToolConfirmation: (call: ToolCall, skillName: string) => void;
  resolveToolConfirmation: (decision: 'approve' | 'deny') => void;
  clearToolConfirmation: () => void;
  startStreaming: () => void;
  stopStreaming: () => void;

  // Derived
  activeConversation: () => Conversation | undefined;
  activeMessages: () => Message[];
}

// ── SQLite persistence ──────────────────────────────────────────────────────────

const DB_NAME = 'pocketsage.db';
let database: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!database) {
    database = SQLite.openDatabaseSync(DB_NAME);
  }
  return database;
}

function rowToConversation(row: ConversationRow): Conversation {
  let messages: Message[] = [];
  try {
    const parsed = JSON.parse(row.messages_json) as unknown;
    if (Array.isArray(parsed)) messages = parsed as Message[];
  } catch {
    messages = [];
  }
  return {
    id: row.id,
    title: row.title,
    messages,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Full rewrite of the conversations table (bounded by MAX_FREE_CONVERSATIONS). */
function persistConversations(conversations: Conversation[]): void {
  try {
    const db = getDb();
    db.withTransactionSync(() => {
      db.execSync('DELETE FROM conversations');
      const statement = db.prepareSync(
        'INSERT INTO conversations (id, title, messages_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      );
      try {
        for (const c of conversations) {
          statement.runSync(
            c.id,
            c.title,
            JSON.stringify(c.messages),
            c.createdAt.getTime(),
            c.updatedAt.getTime(),
          );
        }
      } finally {
        statement.finalizeSync();
      }
    });
  } catch (error) {
    console.error('[conversations] Failed to persist to SQLite', error);
  }
}

function truncateTitle(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/** Append a message to the active conversation, persisting afterwards. */
function appendToActive(
  set: (partial: Partial<ConversationState>) => void,
  get: () => ConversationState,
  buildMessage: (active: Conversation) => Message,
): void {
  const active = get().activeConversation();
  if (!active) return;
  const message = buildMessage(active);
  const conversations = get().conversations.map((c) =>
    c.id === active.id ? { ...c, messages: [...c.messages, message], updatedAt: new Date() } : c,
  );
  set({ conversations });
  persistConversations(conversations);
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,
  streamingText: '',
  pendingToolConfirmation: null,
  lastConfirmationDecision: null,

  initialize: async () => {
    try {
      const db = getDb();
      db.execSync(
        `CREATE TABLE IF NOT EXISTS conversations (
           id TEXT PRIMARY KEY NOT NULL,
           title TEXT NOT NULL,
           messages_json TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         )`,
      );
      const rows = db.getAllSync<ConversationRow>(
        'SELECT * FROM conversations ORDER BY updated_at DESC',
      );
      const conversations = rows.map(rowToConversation);
      set({ conversations });
    } catch (error) {
      console.error('[conversations] Failed to load from SQLite', error);
    }
  },

  createConversation: () => {
    const id = uuid();
    const now = new Date();
    const conversation: Conversation = {
      id,
      title: 'New Conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    let conversations = [conversation, ...get().conversations];
    // Keep the store bounded (offline storage is finite).
    if (conversations.length > MAX_FREE_CONVERSATIONS) {
      conversations = conversations.slice(0, MAX_FREE_CONVERSATIONS);
    }
    set({ conversations, activeConversationId: id });
    persistConversations(conversations);
    return id;
  },

  deleteConversation: (id) => {
    const conversations = get().conversations.filter((c) => c.id !== id);
    const activeConversationId =
      get().activeConversationId === id ? null : get().activeConversationId;
    set({ conversations, activeConversationId });
    persistConversations(conversations);
  },

  setActiveConversation: (id) => {
    if (!get().conversations.some((c) => c.id === id)) return;
    set({ activeConversationId: id });
  },

  addUserMessage: (content) => {
    const text = content.trim();
    if (!text) return;

    let { conversations, activeConversationId } = get();
    let active = conversations.find((c) => c.id === activeConversationId) ?? null;

    // Auto-create a conversation when none is active.
    if (!active) {
      const id = uuid();
      active = {
        id,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      conversations = [active, ...conversations];
      activeConversationId = id;
    }

    const title = active.messages.length === 0 ? truncateTitle(text) : active.title;
    const message: Message = { role: 'user', content: text };
    const updated = conversations.map((c) =>
      c.id === active!.id
        ? { ...c, title, messages: [...c.messages, message], updatedAt: new Date() }
        : c,
    );
    set({ conversations: updated, activeConversationId });
    persistConversations(updated);
  },

  addAssistantMessage: (content) => {
    appendToActive(set, get, () => ({ role: 'assistant', content }));
  },

  appendStreamingToken: (token) => {
    set((s) => ({ streamingText: s.streamingText + token }));
  },

  setStreamingText: (content) => {
    set({ streamingText: content });
  },

  finalizeStreaming: (content) => {
    const active = get().activeConversation();
    if (!active) {
      set({ streamingText: '', isStreaming: false });
      return;
    }
    const trimmed = content.trim();
    const messages =
      trimmed.length > 0
        ? [...active.messages, { role: 'assistant' as const, content: trimmed }]
        : active.messages;
    const conversations = get().conversations.map((c) =>
      c.id === active.id ? { ...c, messages, updatedAt: new Date() } : c,
    );
    set({ conversations, streamingText: '', isStreaming: false });
    persistConversations(conversations);
  },

  addToolCall: (call) => {
    const argsSummary =
      call.arguments && Object.keys(call.arguments).length > 0
        ? ` ${JSON.stringify(call.arguments)}`
        : '';
    appendToActive(set, get, () => ({
      role: 'tool',
      name: call.name,
      content: `Tool: ${call.name}${argsSummary}`,
    }));
  },

  addToolResult: (result) => {
    const summary = result.error
      ? `Error: ${result.error}`
      : typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result ?? null);
    appendToActive(set, get, () => ({
      role: 'tool',
      name: result.toolCallId,
      content: summary,
    }));
  },

  requestToolConfirmation: (call, skillName) => {
    set({ pendingToolConfirmation: { call, skillName }, lastConfirmationDecision: null });
  },

  resolveToolConfirmation: (decision) => {
    set({ pendingToolConfirmation: null, lastConfirmationDecision: decision });
  },

  clearToolConfirmation: () => {
    set({ pendingToolConfirmation: null, lastConfirmationDecision: null });
  },

  startStreaming: () => {
    set({ isStreaming: true, streamingText: '' });
  },

  stopStreaming: () => {
    set({ isStreaming: false });
  },

  activeConversation: () => {
    const { conversations, activeConversationId } = get();
    return conversations.find((c) => c.id === activeConversationId);
  },

  activeMessages: () => {
    return get().activeConversation()?.messages ?? [];
  },
}));

export type ConversationStore = typeof useConversationStore;
