# PocketSage

**On-device AI agent for iOS & Android.** Llama 3.2 via ExecuTorch. Tool calling. RAG memory. Fully offline.

> Your AI runs entirely on this phone. No cloud. No account. No data collection.

## Architecture

```
pocketsage/
├── packages/
│   └── agent-runtime/        # Pure TypeScript library — on-device AI agent runtime
│       ├── executorch/       # Low-level ExecuTorch bridge (Llama 3.2)
│       ├── models/           # Model catalog + download management
│       ├── inference/        # generateText, streamMessage, generateObject
│       ├── rag/              # chunkText, embed, VectorStore, MemoryManager
│       ├── skills/           # SkillRegistry, SKILL.md loader
│       └── agent/            # Agent loop, context builder
├── apps/
│   └── agent/                # Expo SDK 57 mobile app
│       ├── app/              # expo-router routes (chat, skills, settings, onboarding)
│       ├── components/       # UI (chat bubbles, skill cards, model picker, settings)
│       ├── skills/           # Bundled skills (calendar, reminders, health, files, contacts)
│       ├── stores/           # Zustand stores (conversation, model, skill, memory)
│       └── hooks/            # useAgent, useModels, useSkills, useMemory
```

## Quick Start

```bash
# Install dependencies
bun install

# Start the app
cd apps/agent
bun run dev

# Run on device
bun run ios
bun run android
```

## How It Works

1. **Llama 3.2 runs on your phone** via react-native-executorch. Models (1B/3B SpinQuant) download once from HuggingFace with SHA-256 verification.
2. **The agent loop** calls the LLM with tools (calendar, reminders, health, files, contacts). If the model requests a tool, the agent executes it and feeds the result back.
3. **RAG memory** chunks conversations, generates embeddings, and stores them in a vector database. At query time, relevant memories are injected into the system prompt.
4. **Skills** are SKILL.md files + TypeScript tool implementations. Enable/disable at will. Compatible with the emerging SKILL.md ecosystem (Claude Code, OpenMinis).
5. **Everything stays on-device.** Zero network calls during inference. No API keys. No accounts.

## Models

| Model | Size | RAM Required | Best For |
|---|---|---|---|
| Llama 3.2 1B SpinQuant | 1.1 GB | 3 GB+ | Quick answers, simple tasks |
| Llama 3.2 3B SpinQuant | 2.5 GB | 5 GB+ | Complex reasoning, multi-step agent tasks |

## Skills

| Skill | What It Does |
|---|---|
| 📅 Calendar | Read your schedule, create events |
| 🔔 Reminders | Set reminders, manage to-dos |
| ❤️ Health | Read steps, heart rate, sleep data |
| 📁 Files | Read and write files on-device |
| 👤 Contacts | Search and look up contacts |

## Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 57, React Native 0.86 |
| AI Runtime | react-native-executorch |
| Models | Llama 3.2 1B/3B SpinQuant |
| UI | React Native + NativeWind (Tailwind) |
| State | Zustand |
| Database | expo-sqlite |
| Payments | RevenueCat |
| Testing | callstack/agent-device |

## License

MIT — see [LICENSE](./LICENSE).

Built on infrastructure proven in [PrepAI](https://prepaihq.com).
