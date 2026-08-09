import { useCallback, useRef } from 'react';
import {
  agentLoop,
  buildAgentContext,
  skillRegistry,
} from '@pocketsage/agent-runtime';
import { useConversationStore } from '@/stores/conversation-store';
import { useModelStore } from '@/stores/model-store';
import { useSkillStore } from '@/stores/skill-store';
import { useMemoryStore } from '@/stores/memory-store';

export function useAgent() {
  const conversation = useConversationStore();
  const model = useModelStore();
  const skills = useSkillStore();
  const memory = useMemoryStore();
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!model.isModelReady()) return;

      const abortController = new AbortController();
      abortRef.current = abortController;

      conversation.startStreaming();
      conversation.addUserMessage(userMessage);

      try {
        const context = await buildAgentContext({
          userMessage,
          conversationHistory: conversation.activeMessages().slice(0, -1), // exclude just-added user msg
          skillRegistry,
          enabledSkills: skills.enabledSkills,
          memoryManager: memory.manager!,
          modelTier: model.activeModel()?.tier ?? 'fast',
          maxSteps: 10,
          callbacks: {
            onToken: (_token, accumulatedText) => {
              conversation.appendStreamingToken(accumulatedText.slice(
                conversation.streamingText.length,
              ));
            },
            onToolCall: (call) => {
              conversation.addToolCall(call);

              // Check permissions
              const perm = skills.toolPermissions[call.name];
              if (perm === 'deny') {
                conversation.addToolResult({
                  toolCallId: call.id,
                  result: null,
                  error: 'Permission denied by user.',
                });
                return;
              }
              if (perm === 'always_allow') {
                return; // Execute without prompt
              }
              // Request confirmation
              conversation.requestToolConfirmation(call, '');
            },
            onComplete: (result) => {
              conversation.finalizeStreaming(result.text);
              conversation.stopStreaming();
              memory.indexExchange(userMessage, result.text);
            },
            onError: (error) => {
              conversation.finalizeStreaming(`Error: ${error.message}`);
              conversation.stopStreaming();
            },
          },
          signal: abortController.signal,
        });

        const { pendingToolConfirmation } = conversation;

        // If tool confirmation is pending, wait for user response
        if (pendingToolConfirmation) {
          // The UI handles the confirmation and calls clearToolConfirmation
          // This is a simplified flow — in production, use a promise-based gate
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              const current = useConversationStore.getState().pendingToolConfirmation;
              if (!current || current.call.id !== pendingToolConfirmation.call.id) {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }

        await agentLoop(context);
      } catch (error) {
        if (error instanceof Error && error.message !== 'Generation was cancelled.') {
          conversation.finalizeStreaming(`Error: ${error.message}`);
          conversation.stopStreaming();
        }
      }
    },
    [conversation, model, skills, memory],
  );

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    conversation.stopStreaming();
  }, [conversation]);

  return {
    sendMessage,
    cancelGeneration,
    isStreaming: conversation.isStreaming,
    messages: conversation.activeMessages(),
  };
}
