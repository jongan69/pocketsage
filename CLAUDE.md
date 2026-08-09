# PocketSage — CLAUDE.md

> **⚠️ FIRST: Read this file before any implementation work.** It is the canonical reference for this codebase. The build spec at `/Users/jonathangan/LocalCode/PRDs/08-offline-ai-agent--MVP-SPEC.md` is the design document — read it second if you need deeper context.

## What We're Building

An on-device AI agent app for iOS & Android. Users chat with a local LLM (Llama 3.2 1B/3B SpinQuant via ExecuTorch). The LLM calls tools (calendar, reminders, health, files, contacts). Conversations and memories persist entirely on-device. Zero cloud. Zero API keys.

## Repository Structure

```
pocketsage/                        # Bun monorepo
├── packages/
│   └── agent-runtime/             # Pure TS library — NO React dependency
│       └── src/
│           ├── index.ts           # Public API barrel export
│           ├── types.ts           # All shared types
│           ├── executorch/        # Low-level ExecuTorch JSI bridge
│           │   ├── model-config.ts     # Model URLs, SHA256 hashes, BUILT_IN_MODELS
│           │   ├── runtime.ts          # Web stub (LLMModule = null)
│           │   ├── runtime.native.ts   # Native: JSI install, LLMModule import
│           │   └── resource-fetcher.ts # Download with progress + SHA256 verify
│           ├── models/            # ModelManager singleton
│           │   ├── index.ts            # ModelManager class
│           │   └── catalog.ts          # getBuiltInModels, getRecommendedModel
│           ├── inference/         # Text generation API
│           │   ├── index.ts            # generateText, streamMessage, generateObject
│           │   ├── queue.ts            # Single-flight queue (JSI is NOT thread-safe)
│           │   ├── prompts.ts          # System prompt builder
│           │   └── parser.ts           # Tool call extraction from LLM output
│           ├── rag/               # Retrieval-Augmented Generation
│           │   ├── index.ts            # Re-exports
│           │   ├── chunker.ts          # Text → overlapping sentence-aware chunks
│           │   ├── embedder.ts         # Text → embedding vectors via ExecuTorch
│           │   ├── vector-store.ts     # In-memory vector store (cosine similarity)
│           │   └── memory-manager.ts   # Conversation indexing + GLOBAL.md persistence
│           ├── skills/            # Skill system (SKILL.md compatible)
│           │   ├── index.ts            # SkillRegistry singleton
│           │   ├── types.ts            # Skill, Tool, ToolCall, ToolResult types
│           │   └── loader.ts           # SKILL.md parser + directory loader
│           └── agent/             # Agent orchestration
│               ├── index.ts            # agentLoop — multi-step tool-calling loop
│               └── context.ts          # buildAgentContext — wires app state to agent
├── apps/
│   └── agent/                     # Expo SDK 57 mobile app
│       ├── app.json              # Expo config (permissions, plugins, scheme)
│       ├── tailwind.config.js    # Theme colors (surface, accent, text tokens)
│       ├── global.css            # Tailwind directives
│       └── src/
│           ├── app/              # expo-router file-based routes
│           │   ├── _layout.tsx        # Root: fonts, init, store providers
│           │   ├── (tabs)/_layout.tsx # Tab navigator (Chat, Skills, Settings)
│           │   ├── (tabs)/index.tsx   # Main chat screen
│           │   ├── (tabs)/skills.tsx  # Skill browser
│           │   ├── (tabs)/settings.tsx# Settings
│           │   ├── onboarding.tsx     # First-launch flow (3 steps)
│           │   ├── skill/[name].tsx   # Skill detail modal
│           │   └── conversation/[id].tsx # Past conversation view
│           ├── components/
│           │   ├── chat/              # ChatScreen, MessageBubble, StreamingText, ChatInput, ToolConfirmation
│           │   ├── skills/            # SkillList, SkillCard, SkillDetail
│           │   ├── models/            # ModelPicker, DownloadProgress
│           │   ├── settings/          # SettingsScreen
│           │   ├── onboarding/        # OnboardingFlow, WelcomeStep, ModelDownloadStep, SkillsSetupStep
│           │   └── ui/                # Button, Card, Input, Screen, Spinner, Badge
│           ├── skills/            # Bundled skill definitions (SKILL.md + skill.ts)
│           │   ├── calendar/
│           │   ├── reminders/
│           │   ├── health/
│           │   ├── files/
│           │   └── contacts/
│           ├── stores/            # Zustand stores
│           │   ├── conversation-store.ts
│           │   ├── model-store.ts
│           │   ├── skill-store.ts
│           │   └── memory-store.ts
│           ├── hooks/             # Custom hooks
│           │   ├── useAgent.ts         # Primary hook: sendMessage, streaming, tool confirmations
│           │   ├── useModels.ts
│           │   ├── useSkills.ts
│           │   └── useMemory.ts
│           └── lib/
│               ├── permissions.ts      # Runtime permission checks
│               └── constants.ts        # App constants
```

## Key Architectural Rules

### 1. Single-flight queue — DO NOT REMOVE
The ExecuTorch JSI bridge is **not thread-safe**. Concurrent LLM calls will crash the native runtime. `inference/queue.ts` ensures only one generation runs at a time. Every call to `generateText` or `streamMessage` goes through `enqueueGeneration()`.

### 2. Library has ZERO React imports
`packages/agent-runtime` is pure TypeScript. It can run in any JS environment (Node, React Native, web worker — though ExecuTorch requires native). The app layer (`apps/agent`) provides React bindings via hooks and stores.

### 3. Models are stateless
Every `generateText()` call receives the full conversation history as a `messages` array. The library maintains no session state. The app layer (Zustand stores) owns all conversation state.

### 4. Skills are opt-in
Users enable skills in the Skills tab or during onboarding. The system prompt only includes enabled skill tools. Tool calls from disabled skills are rejected at the registry level before execution.

### 5. Everything is on-device
No network calls during inference. The only network operations are: model downloads (HuggingFace), and RevenueCat receipt validation (if monetization is enabled). There is no cloud fallback — if a device can't run the model, show a clear message, don't silently ship data to a server.

## Data Flow

```
User types message
  → ChatInput calls useAgent.sendMessage(text)
    → ConversationStore.addUserMessage(text)
    → buildAgentContext(options)           # agent/context.ts
      → MemoryManager.search(query)        # RAG recall
      → buildSystemPrompt(skills, memories)# inference/prompts.ts
      → SkillRegistry.getToolsForSkills()  # available tools
    → agentLoop(context)                   # agent/index.ts
      → generateText(messages, {tools})    # inference/index.ts
        → enqueueGeneration()              # inference/queue.ts
        → LLMModule.generate()             # ExecuTorch JSI call
          → onToken callback               # streams to ConversationStore
        → parseToolCalls(response)         # inference/parser.ts
      → if tool_calls:
          → ToolConfirmation modal         # user approves/denies
          → SkillRegistry.execute(call)    # skills/index.ts
          → feed result back → loop
      → if answer:
          → MemoryManager.index(q, a)      # persist to vector store
          → ConversationStore.addAssistantMessage(text)
    → StreamingText renders token by token
```

## Theme / Design Tokens

All styling uses NativeWind (Tailwind CSS in React Native). The design is **dark theme only** for MVP.

| Token | Hex | Tailwind Class |
|---|---|---|
| Surface (bg) | #0a0a0a | `bg-surface` |
| Surface secondary | #141414 | `bg-surface-secondary` |
| Surface tertiary | #1c1c1c | `bg-surface-tertiary` |
| Accent | #6366f1 | `bg-accent`, `text-accent` |
| Accent muted | #4338ca | `bg-accent-muted` |
| Text primary | #f5f5f5 | `text-text-primary` |
| Text secondary | #a3a3a3 | `text-text-secondary` |
| Text muted | #525252 | `text-text-muted` |
| Success | #22c55e | `text-success` |
| Warning | #f59e0b | `text-warning` |
| Danger | #ef4444 | `text-danger` |

Use these classes. Never write hex values directly in components.

## Conventions

- **TypeScript strict mode** everywhere
- **Path aliases:** `@/` → `apps/agent/src/`, `@pocketsage/agent-runtime` → `packages/agent-runtime/src/index.ts`
- **Components:** PascalCase files. One component per file (plus optionally a few small sub-components).
- **Imports order:** React → Expo → third-party → `@pocketsage/agent-runtime` → `@/` local
- **State management:** Zustand for global state. React Context only for provider injection at root. No Redux.
- **Styling:** NativeWind `className` prop. No inline styles. Use the design tokens above.
- **Icons:** lucide-react-native exclusively.
- **Naming:** camelCase for variables/functions, PascalCase for components/classes/types.
- **Exports:** Named exports only (no `export default`). Barrel exports from `index.ts` files.
- **Types:** `import type` for type-only imports. Explicit return types on public functions.

## Package Manager

This project uses **bun** (v1.3.14+). Commands:
```bash
bun install          # Install all workspace deps
bun run typecheck    # TypeScript check across all packages
bun run dev          # Start Expo dev server
bun run test         # Run tests across all packages
```

## Model Information

Models are downloaded from HuggingFace: `software-mansion/react-native-executorch-llama-3.2/resolve/v0.8.0`

| Model | File | Size | SHA256 (first 16 chars) |
|---|---|---|---|
| Llama 3.2 1B SpinQuant | `llama3_2_spinquant.pte` | 1.1 GB | `998bf825f0990a4d...` |
| Llama 3.2 3B SpinQuant | `llama3_2_3B_spinquant.pte` | 2.5 GB | `55d7f829f1306333...` |
| Tokenizer | `tokenizer.json` | 9.9 MB | `0b9897f5668a5d20...` |
| Tokenizer config | `tokenizer_config.json` | 55 KB | `9c9a5f7314e24635...` |

Full hashes are in `packages/agent-runtime/src/executorch/model-config.ts`.

## PrepAI Provenance

The on-device AI infrastructure (ExecuTorch bridge, model config, resource fetcher, single-flight queue) was extracted from **PrepAI** (`/Users/jonathangan/LocalCode/PrepAI/`), a production health AI app that proved Llama 3.2 runs reliably on-device with streaming, SHA256-verified downloads, and zero cloud dependency.

Key files adapted from PrepAI:
- `packages/agent-runtime/src/executorch/runtime.native.ts` ← `PrepAI/src/lib/executorch-runtime.native.ts`
- `packages/agent-runtime/src/executorch/model-config.ts` ← `PrepAI/src/lib/executorch-model-config.ts`
- `packages/agent-runtime/src/executorch/resource-fetcher.ts` ← `PrepAI/src/lib/executorch-resource-fetcher.ts`
- `packages/agent-runtime/src/inference/queue.ts` ← `PrepAI/src/lib/ai-runtime.ts` (single-flight pattern)

Changes made: removed PrepAI branding, removed health-specific constraints, parameterized storage prefixes, added `BUILT_IN_MODELS: ModelInfo[]` array.

## External References

- Build spec: `/Users/jonathangan/LocalCode/PRDs/08-offline-ai-agent--MVP-SPEC.md`
- PRD: `/Users/jonathangan/LocalCode/PRDs/08-offline-ai-agent.md`
- PrepAI codebase: `/Users/jonathangan/LocalCode/PrepAI/`
- [react-native-executorch](https://github.com/software-mansion/react-native-executorch) — The LLM runtime
- [expo-ai-kit](https://expo-ai-kit.dev) — Alternative runtime (LiteRT-LM, future backend option)
- [OpenMinis](https://github.com/OpenMinis/OpenMinis) — Architecture reference (GPLv3, native Swift/Kotlin, learn patterns only)
- [callstack/agent-device](https://github.com/callstack/agent-device) — E2E testing tool
- [Frozen MTP research](https://research.google/blog/accelerating-gemini-nano-models-on-pixel-with-frozen-multi-token-prediction/) — Acceleration technique for future performance work
