import { useCallback, useEffect, useRef } from 'react';
import type { ToolCall } from '@pocketsage/agent-runtime';
import { agentLoop, buildAgentContext, skillRegistry } from '@pocketsage/agent-runtime';
import { useConversationStore } from '@/stores/conversation-store';
import { useModelStore } from '@/stores/model-store';
import { useSkillStore } from '@/stores/skill-store';
import { useMemoryStore } from '@/stores/memory-store';
import { uuid } from '@/lib/uuid';
import { DEFAULT_MODEL_TIER, MAX_AGENT_STEPS } from '@/lib/constants';

type ConfirmationDecision = 'approve' | 'deny';

interface PendingConfirmationGate {
  call: ToolCall;
  skillName: string;
  resolve: (decision: ConfirmationDecision) => void;
}

const CONFIRMATION_POLL_MS = 120;

/**
 * The primary agent hook. Wires the app stores to the runtime agent loop:
 *
 * - `sendMessage` builds an agent context, applies the tool permission
 *   policy (deny → refuse, always_allow → run, ask → confirmation gate),
 *   streams tokens, and persists the finished exchange + memory index.
 * - Tool confirmations are promise-based: `requestToolConfirmation` blocks
 *   the executor until the UI resolves via `resolveToolConfirmation`.
 *   The confirmation promise is also resolved when the store's pending
 *   state clears without an explicit decision (treated as approval), so any
 *   UI that clears the pending state keeps the loop running.
 */
export function useAgent() {
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const streamingText = useConversationStore((s) => s.streamingText);
  const messages = useConversationStore((s) => s.activeConversation()?.messages ?? []);
  const pendingToolConfirmation = useConversationStore((s) => s.pendingToolConfirmation);

  const abortRef = useRef<AbortController | null>(null);
  const pendingConfirmRef = useRef<PendingConfirmationGate | null>(null);

  // Resolve a pending confirmation whenever the store's pending state
  // clears — either through resolveToolConfirmation (decision-aware) or a
  // UI-level clearToolConfirmation (treated as approval).
  useEffect(() => {
    if (!pendingToolConfirmation) return;
    const interval = setInterval(() => {
      const state = useConversationStore.getState();
      if (state.pendingToolConfirmation === null) {
        clearInterval(interval);
        const decision = state.lastConfirmationDecision ?? 'approve';
        const gate = pendingConfirmRef.current;
        if (gate) {
          pendingConfirmRef.current = null;
          gate.resolve(decision);
        }
      }
    }, CONFIRMATION_POLL_MS);
    return () => clearInterval(interval);
  }, [pendingToolConfirmation]);

  const requestToolConfirmation = useCallback(
    (call: ToolCall, skillName: string): Promise<ConfirmationDecision> => {
      return new Promise((resolve) => {
        pendingConfirmRef.current = { call, skillName, resolve };
        useConversationStore.getState().requestToolConfirmation(call, skillName);
      });
    },
    [],
  );

  const resolveToolConfirmation = useCallback((decision: ConfirmationDecision) => {
    const gate = pendingConfirmRef.current;
    useConversationStore.getState().resolveToolConfirmation(decision);
    if (gate) {
      pendingConfirmRef.current = null;
      gate.resolve(decision);
    }
  }, []);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      const conversation = useConversationStore.getState();
      const model = useModelStore.getState();
      const skillState = useSkillStore.getState();
      const memory = useMemoryStore.getState();

      if (!model.isModelReady()) return;

      const abortController = new AbortController();
      abortRef.current = abortController;
      const signal = abortController.signal;

      conversation.addUserMessage(userMessage);
      conversation.startStreaming();

      try {
        const memoryManager = memory.manager;
        if (!memoryManager) {
          conversation.finalizeStreaming('Memory is still initializing — try again in a moment.');
          return;
        }

        const context = await buildAgentContext({
          userMessage,
          // buildAgentContext appends the user message itself, so pass the
          // prior history (excluding the message just added above).
          conversationHistory: conversation.activeMessages().slice(0, -1),
          skillRegistry,
          enabledSkills: skillState.enabledSkills,
          memoryManager,
          modelTier: model.activeModel()?.tier ?? DEFAULT_MODEL_TIER,
          maxSteps: MAX_AGENT_STEPS,
          callbacks: {
            onToken: (_token: string, accumulated: string) => {
              // The runtime delivers each step's full text in one callback;
              // replace the streaming buffer so multi-step runs show only
              // the latest text.
              const current = useConversationStore.getState();
              if (current.streamingText !== accumulated) {
                current.setStreamingText(accumulated);
              }
            },
            onToolCall: (call: ToolCall) => {
              useConversationStore.getState().addToolCall(call);
            },
            onComplete: (result) => {
              const current = useConversationStore.getState();
              current.finalizeStreaming(result.text);
              current.stopStreaming();
              void memory.indexExchange(userMessage, result.text).catch(() => {
                // Memory indexing is best-effort.
              });
            },
            onError: (error) => {
              const current = useConversationStore.getState();
              if (current.streamingText.trim().length > 0) {
                current.finalizeStreaming(current.streamingText);
              } else {
                current.finalizeStreaming(`I ran into a problem: ${error.message}`);
              }
              current.stopStreaming();
            },
          },
          signal,
        });

        const baseExecutor = context.toolExecutor;

        // Permission policy: the executor is the single gate for tool
        // execution — deny refuses outright, always_allow skips the prompt,
        // and anything else waits on a user confirmation.
        context.toolExecutor = async (name: string, args: Record<string, unknown>) => {
          if (signal.aborted) throw new Error('Generation was cancelled.');
          const permission = useSkillStore.getState().toolPermissions[name] ?? 'ask';
          if (permission === 'deny') {
            throw new Error(`Tool "${name}" was denied by the user.`);
          }
          if (permission === 'always_allow') {
            return baseExecutor(name, args);
          }
          const skillName = skillRegistry.findSkillForTool(name) ?? '';
          const decision = await requestToolConfirmation(
            { id: uuid(), name, arguments: args ?? {} },
            skillName,
          );
          if (decision === 'deny' || signal.aborted) {
            throw new Error(`Tool "${name}" was denied by the user.`);
          }
          return baseExecutor(name, args);
        };

        await agentLoop(context);

        // Aborts return a partial result without firing onComplete; keep
        // whatever was streamed so far.
        if (signal.aborted) {
          const current = useConversationStore.getState();
          current.finalizeStreaming(current.streamingText);
          current.stopStreaming();
        }
      } catch (error) {
        const current = useConversationStore.getState();
        if (current.isStreaming) {
          const message =
            error instanceof Error ? error.message : String(error);
          current.finalizeStreaming(`I ran into a problem: ${message}`);
        }
        current.stopStreaming();
      }
    },
    [requestToolConfirmation],
  );

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    const gate = pendingConfirmRef.current;
    if (gate) {
      pendingConfirmRef.current = null;
      gate.resolve('deny');
    }
    useConversationStore.getState().clearToolConfirmation();
    useConversationStore.getState().stopStreaming();
  }, []);

  return {
    sendMessage,
    cancelGeneration,
    resolveToolConfirmation,
    isStreaming,
    streamingText,
    messages,
    pendingToolConfirmation,
  };
}
