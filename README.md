# PocketSage

**On-device AI agent. Llama 3.2 via ExecuTorch. Tool calling. RAG memory. Fully offline. MIT.**

> Your AI runs entirely on this phone. No cloud. No account. No data collection. No compromise.

---

## The Thesis

**On-device AI crossed the feasibility threshold in 2025–2026.** Three independent lines of research converged to make this possible, and PocketSage is built at their exact intersection:

| Convergence Point | Research Line | What It Unlocked |
|---|---|---|
| **Models got smaller without getting dumber** | SpinQuant (Meta, ICLR 2025) — learned rotation matrices enable W4A4KV4 quantization with only 2.9-point accuracy loss on Llama 2 7B [[Liu et al. 2025]](https://arxiv.org/abs/2405.16406) | Llama 3.2 1B/3B runs on a phone at 2–4× faster than FP16, using < 2.5GB storage |
| **Inference got dramatically faster** | Frozen Multi-Token Prediction (Google, 2026) — lightweight transformer head bolted onto frozen model activations drafts 2+ tokens per pass, 50%+ speedup, bit-for-bit identical output [[Google Research, June 2026]](https://research.google/blog/accelerating-gemini-nano-models-on-pixel-with-frozen-multi-token-prediction/). Built on the EAGLE lineage: feature-level speculative decoding (2.7–3.5×, ICLR 2024) → direct token prediction with multi-layer fusion (6.5×, NeurIPS 2025) [[Li et al. 2024]](https://arxiv.org/abs/2401.15077) [[Li et al. 2025]](https://arxiv.org/abs/2503.01840) | On-device inference feels responsive — sub-2s time-to-first-token on flagship phones |
| **Mobile ML runtimes matured** | ExecuTorch 1.0 (Meta, Oct 2025) — PyTorch-native edge inference: 55% binary size reduction, 3.8× throughput increase, 87.7% lower startup latency. Powers on-device AI across Meta's family of apps (Instagram, WhatsApp, Quest, Ray-Ban) [[PyTorch Foundation, 2025]](https://pytorch.org/executorch/) | Production-grade model loading, hardware acceleration, and cross-platform support on iOS and Android |
| **Agent architectures were proven** | ReAct (Yao et al., ICLR 2023) — interleaved reasoning and acting in LLMs. Overcame hallucination in QA by interacting with external tools via Wikipedia API. 34% improvement on decision-making benchmarks [[Yao et al. 2023]](https://arxiv.org/abs/2210.03629). OpenMinis (2026) proved the pattern works on mobile with 30+ native bridges and a skills ecosystem [[OpenMinis, 2026]](https://github.com/OpenMinis/OpenMinis) | LLMs can reason → act → observe → reason in a loop, turning a text generator into an agent |
| **Privacy became the killer feature** | ACM Computing Surveys (2025) comprehensive taxonomy of on-device AI: real-time performance, resource constraints, enhanced data privacy as core characteristics [[ACM CSUR, 2025]](https://dl.acm.org/doi/10.1145/3724420). SoK on mobile on-device AI attacks/defenses (2026) — TEEs, differential privacy, homomorphic encryption [[arXiv:2607.00362, 2026]](https://arxiv.org/abs/2607.00362) | "No data leaves the device" is not a slogan — it's a provable privacy guarantee backed by a growing security literature |

**The bet:** By 2027, on-device AI agents will be the default, not the exception. Cloud-dependent assistants will feel like webmail in a Gmail world — familiar, but not where the interesting work happens. PocketSage is built for that world.

---

## What PocketSage Is

An iOS and Android app where you chat with a local LLM that can actually *do things* — check your calendar, set reminders, read health data, search files and contacts. The model (Llama 3.2 1B or 3B, SpinQuant-quantized) runs on your phone via ExecuTorch. Conversations and memories stay in a local vector database. Zero bytes leave the device.

| | PocketSage | Siri / Apple Intelligence | OpenMinis | ChatGPT App |
|---|---|---|---|---|
| **On-device LLM inference** | ✅ Llama 3.2 via ExecuTorch | ✅ Apple models only | ❌ BYO API keys (cloud) | ❌ Cloud only |
| **Truly offline** | ✅ After model download | ⚠️ Partial | ❌ Requires internet | ❌ Requires internet |
| **Tool calling agent loop** | ✅ ReAct-pattern: reason → act → observe | ⚠️ Limited App Intents | ✅ Shell-driven (Linux sandbox) | ✅ Cloud tools |
| **Persistent RAG memory** | ✅ Vector store + GLOBAL.md | ❌ | ✅ GLOBAL.md | ⚠️ Cloud memory |
| **Cross-platform** | ✅ iOS + Android | ❌ Apple only | ✅ iOS + Android | ✅ |
| **Open source** | ✅ MIT | ❌ | ✅ GPLv3 | ❌ |
| **SKILL.md ecosystem** | ✅ Compatible | ❌ | ✅ Native | ❌ |
| **Zero data collection** | ✅ Provable: no network calls during inference | ⚠️ Apple sees requests | ⚠️ API keys → third parties | ❌ Everything to OpenAI |

---

## Research Foundation

### 1. Quantization: Making Models Fit on Phones

The fundamental challenge: full-precision Llama 3.2 1B requires ~4GB of memory — too much for backgrounded mobile apps. The solution came from **SpinQuant** [[Liu et al., ICLR 2025]](https://arxiv.org/abs/2405.16406), a post-training quantization technique from Meta that learns optimal rotation matrices via Cayley optimization. Key results:

- **4-bit weights, 4-bit activations, 4-bit KV cache** (W4A4KV4) on Llama 2 7B: only **2.9 points** below full-precision accuracy
- Outperforms SmoothQuant by **25.0 points** and LLM-QAT by **19.1 points**
- **56% model size reduction**, **41% memory reduction**, **2–4× faster inference** on mobile hardware
- Shipped in production for Llama 3.2 1B/3B on-device (Meta Connect, Oct 2024)

PocketSage runs Llama 3.2 1B SpinQuant (1.1 GB) and 3B SpinQuant (2.5 GB) — the exact models Meta shipped for on-device deployment. SHA-256 hashes are pinned in `model-config.ts`, verified before loading.

### 2. Speculative Decoding: Making Inference Feel Fast

Autoregressive generation (one token per forward pass) is too slow for mobile. The research trajectory that solved this:

| Paper | Venue | Key Innovation | Speedup |
|---|---|---|---|
| **EAGLE** [[Li et al. 2024]](https://arxiv.org/abs/2401.15077) | ICML 2024 | Feature-level speculative decoding (draft at second-to-top layer) | 2.7–3.5× |
| **EAGLE-3** [[Li et al. 2025]](https://arxiv.org/abs/2503.01840) | NeurIPS 2025 | Direct token prediction + multi-layer feature fusion | 6.5× |
| **P-EAGLE** [[arXiv:2602.01469]](https://arxiv.org/abs/2602.01469) | 2025 | Parallel drafting + scalable training | — |
| **Frozen MTP** [[Google Research, 2026]](https://research.google/blog/accelerating-gemini-nano-models-on-pixel-with-frozen-multi-token-prediction/) | Google (Production) | Zero-copy KV cache, frozen backbone, 130MB saved | 50%+ on Pixel |

The frozen MTP technique is directly applicable to Llama 3.2: train a lightweight MTP head on the frozen model's final-layer activations, cross-attending to the existing KV cache. The head is a small `.pte` file (tens of MB) distributed alongside model weights. When ExecuTorch or react-native-executorch ships MTP support, PocketSage gets the speedup for free on existing models. This is on the [roadmap](#roadmap).

### 3. Agent Architectures: Making LLMs Do Things

**ReAct** [[Yao et al., ICLR 2023]](https://arxiv.org/abs/2210.03629) established the pattern: interleave reasoning traces with tool-use actions. The model thinks, acts, observes the result, and thinks again. PocketSage's `agentLoop()` implements this directly:

```
User: "What's on my calendar today?"
  → Model: "I'll check your calendar." → tool: calendar.list({...})
  → Agent executes calendar.list → returns 3 events
  → Model: "You have 3 events today: ..."
```

OpenMinis [[GitHub, 2026]](https://github.com/OpenMinis/OpenMinis) proved the pattern works on mobile with 30+ native bridges (HealthKit, HomeKit, Bluetooth, NFC, calendar, reminders), a skills system (SKILL.md), persistent memory (GLOBAL.md), and MCP integration. 3,000+ GitHub stars. MacStories called it "the iOS agent I wish Siri was." PocketSage is the Expo/React Native answer — same architecture, but with on-device LLM inference (OpenMinis requires cloud API keys) and MIT license (OpenMinis is GPLv3).

### 4. Privacy: Making the Guarantee Provable

The privacy argument for on-device AI is increasingly backed by systematic research:

- **ACM Computing Surveys (2025)** [[DOI: 10.1145/3724420]](https://dl.acm.org/doi/10.1145/3724420): Comprehensive taxonomy of on-device AI models — "enhanced data privacy" identified as a core characteristic alongside real-time performance and resource constraints.
- **Protecting On-Device AI Inference (2026)** [[arXiv:2605.29450]](https://arxiv.org/abs/2605.29450): First systematic review of threats and defenses specifically for on-device AI inference. Covers TEEs, homomorphic encryption, differential privacy, obfuscation.
- **SoK: Mobile On-Device AI Systems (2026)** [[arXiv:2607.00362]](https://arxiv.org/abs/2607.00362): Systematization of Knowledge cataloging attacks (adversarial, backdoor, model stealing) and defenses on mobile platforms.
- **Edge-Deployed Generative AI (IEEE 2026)**: Security analysis of LLMs on edge devices — hardware-level exploits, power analysis, cache side-channel attacks. Defenses evaluated with 3–21% CPU overhead.

PocketSage's privacy model is simple and auditable: **zero network calls during inference.** The app's network permission can be revoked after model download and the agent still works. No differential privacy parameters to tune. No trusted execution environment to trust. No cloud fallback to leak through. This is the strongest privacy guarantee available in mobile AI.

### 5. The Mobile Runtime: ExecuTorch

**ExecuTorch** [[PyTorch Foundation, 1.0 Oct 2025]](https://pytorch.org/executorch/) is Meta's production-grade on-device inference runtime. It powers AI across Instagram, WhatsApp, Messenger, Facebook, Quest, and Ray-Ban Meta smart glasses. Key benchmarks:

- **55% binary size reduction**, **3.8× throughput**, **87.7% lower startup latency** (June 2026)
- Arm SME2 acceleration: **3.9× FP16 speedup** on SqueezeSAM (1,163ms → 298ms)
- INT4, INT8, group-wise quantization, QAT support
- CPU (XNNPACK), GPU (Metal MPS, Vulkan), NPU backends

The `react-native-executorch` library (Software Mansion) bridges ExecuTorch into React Native. PocketSage's `packages/agent-runtime/src/executorch/` layer wraps this with SHA-256 verified downloads, background download with pause/resume, single-flight generation queue (JSI thread safety), and platform split (native/web stubs).

---

## Architecture

```
pocketsage/
├── packages/
│   └── agent-runtime/        # Pure TypeScript — zero React deps. Publishable to npm.
│       ├── executorch/       # JSI bridge, model configs, SHA-256 verified downloads
│       ├── models/           # ModelManager singleton (list, download, verify, switch)
│       ├── inference/        # generateText, streamMessage, generateObject<T>
│       ├── rag/              # chunkText → embed → VectorStore (cosine) → MemoryManager
│       ├── skills/           # SKILL.md parser, SkillRegistry, tool execution
│       └── agent/            # ReAct-pattern agentLoop, context builder
├── apps/
│   └── agent/                # Expo SDK 57, NativeWind dark theme
│       ├── app/              # expo-router: chat, skills, settings, onboarding
│       ├── components/       # ChatScreen, MessageBubble, StreamingText, ToolConfirmation
│       ├── skills/           # 5 bundled skills (calendar, reminders, health, files, contacts)
│       ├── stores/           # Zustand + SQLite (conversations), polling sync (models)
│       └── hooks/            # useAgent, useModels, useSkills, useMemory
```

Data flow: `User message → ConversationStore → buildAgentContext (RAG recall + skill resolution) → agentLoop (ReAct: generateText → parseToolCalls → execute → feed back → loop) → StreamingText renders tokens`

---

## Quick Start

```bash
bun install
cd apps/agent
bun run dev        # Expo dev server
bun run ios        # iOS simulator
bun run android    # Android emulator
```

Requires Expo SDK 57+, a native build with `react-native-executorch`, and a downloaded model (1.1 GB or 2.5 GB from HuggingFace, SHA-256 verified).

---

## Roadmap

### v0.1 — MVP (Current)
- [x] Llama 3.2 1B/3B SpinQuant via ExecuTorch
- [x] Streaming token generation with abort
- [x] ReAct-pattern agent loop with tool calling
- [x] SKILL.md-compatible skill system (5 bundled skills)
- [x] RAG memory: chunk → embed → vector store → recall
- [x] GLOBAL.md persistent memory (OpenMinis-compatible)
- [x] SHA-256 verified model downloads with pause/resume
- [x] expo-sqlite conversation persistence
- [x] Dark-themed chat UI with tool confirmation modals
- [x] 3-step onboarding (privacy → model → skills)

### v0.2 — Performance (Target: Aug–Sep 2026)
- [ ] **Frozen MTP head** for Llama 3.2 SpinQuant models. Train lightweight transformer head on frozen activations. Target: 40–60% throughput improvement. Dependency: ExecuTorch MTP support or custom `.pte` extension.
- [ ] **Model warm-start**: preload Llama 3.2 1B into memory on app launch. Target: < 500ms time-to-first-token.
- [ ] **KV cache quantization**: apply SpinQuant rotations to KV cache. Target: 30% memory reduction during inference.
- [ ] **Token-level streaming** through the JSI bridge (currently batch streaming). Target: true per-token UI updates.
- [ ] Benchmark suite: measure TTFT, tokens/sec, memory usage, battery drain across iPhone 14–16 and Pixel 7–10.

### v0.3 — Capabilities (Target: Oct–Nov 2026)
- [ ] **Browser automation skill**: WebView-based browsing with content extraction (read articles, fill forms).
- [ ] **Multi-modal input**: LFM2-VL vision model for camera-based queries (already proven in PrepAI — extract and generalize).
- [ ] **Voice input/output**: on-device Whisper (speech-to-text) + Kokoro (text-to-speech) via ExecuTorch audio modules.
- [ ] **Background execution**: iOS Live Activity + location heartbeat + background audio to keep agent alive for long-running tasks.
- [ ] **Proactive suggestions**: agent periodically checks context (calendar, reminders, health trends) and surfaces insights without being asked. On-device cron via `expo-task-manager`.
- [ ] **Skill marketplace**: browse and install community skills from a GitHub-based registry. One-tap install.

### v0.4 — Intelligence (Target: Dec 2026–Jan 2027)
- [ ] **Multi-model backend**: add LiteRT-LM support (Gemma 4B, Qwen 1.7B, Phi-4-mini) via `expo-ai-kit` as alternative runtime. Let users choose ExecuTorch or LiteRT-LM backends.
- [ ] **On-device fine-tuning**: gradient-free adaptation via zeroth-order optimization (NeurIPS 2024 technique). Personalize the model to the user's writing style and preferences without backpropagation. Dependency: ExecuTorch LoRA support.
- [ ] **Cross-skill reasoning**: agent chains multiple skills in a single plan. "Find my last health report, summarize it, and add a reminder to discuss with my doctor."
- [ ] **Hierarchical planning**: model generates a plan → executes step by step → replans on failure. Goes beyond ReAct into plan-and-execute agent patterns.
- [ ] **Federated skill improvements**: aggregate anonymized skill usage patterns to improve tool descriptions and trigger detection (opt-in, differential privacy).

### v1.0 — Platform (Target: Q1 2027)
- [ ] **macOS desktop app**: same codebase, Catalyst/Mac Catalyst target. On-device Llama on Mac (much faster — M-series chips).
- [ ] **watchOS companion**: Apple Watch app for voice queries. Delegates to phone for inference.
- [ ] **`@pocketsage/agent-runtime` on npm**: library is stable, documented, and used by third-party apps. React Native's standard on-device AI agent library.
- [ ] **App Store / Play Store**: full listing with privacy nutrition labels ("No Data Collected" — auditable claim).

---

## Prior Art & Inspirations

| Project | What We Learned |
|---|---|
| **[PrepAI](https://prepaihq.com)** | On-device Llama 3.2 + ExecuTorch works in production. SHA-256 verified downloads. Single-flight queue. Token streaming. HealthKit integration. The ExecuTorch bridge in `packages/agent-runtime` was extracted and generalized from PrepAI's production AI stack. |
| **[OpenMinis](https://github.com/OpenMinis/OpenMinis)** | Agent architecture on mobile: SKILL.md ecosystem, GLOBAL.md memory, 30+ native bridges, MCP integration. Proved the pattern works. PocketSage adopts the same architecture but adds on-device LLM inference (OpenMinis requires cloud API keys) and uses MIT license (OpenMinis is GPLv3). |
| **[expo-ai-kit](https://github.com/EvanBacon/expo-ai)** | On-device AI as an Expo library call. Streaming, tool calling, RAG. PocketSage currently uses ExecuTorch instead of LiteRT-LM (different runtime, different models), but LiteRT-LM support is planned as an alternative backend (v0.4). |
| **[Zero-Assist](https://devpost.com/software/zero-assist)** | Privacy-first Android on-device AI assistant. Rust AI core, local TTS, Spotify automation. Proved "100% offline AI assistant" resonates with users. |
| **[callstack/agent-device](https://github.com/callstack/agent-device)** | AI-driven mobile testing. Accessibility-tree snapshots for token-efficient UI inspection. PocketSage uses this for CI testing. |

---

## Key Design Decisions

**Why ExecuTorch instead of LiteRT-LM?** ExecuTorch runs Llama 3.2 — the most widely deployed open-weight model family. It's Meta's production runtime (Instagram, WhatsApp, Quest). LiteRT-LM runs Gemma/Qwen/Phi — different model ecosystem. Both will be supported (v0.4).

**Why SKILL.md instead of a custom format?** SKILL.md is becoming a standard: Claude Code, Codex, OpenMinis, and Hermes Agent all use it. PocketSage skills work across ecosystems with minimal adaptation (replace shell commands with native module calls).

**Why single-flight queue?** ExecuTorch's JSI bridge is not thread-safe. Concurrent LLM calls crash the native runtime. The single-flight queue (adapted from PrepAI) ensures only one generation runs at a time. This is a hard constraint — removing it will crash the app.

**Why no cloud fallback?** PocketSage's privacy guarantee is "zero network calls during inference." Adding cloud fallback makes this guarantee unprovable. If a device can't run the model, the app shows a clear message rather than silently shipping data to a server. This is a product decision, not a technical limitation.

---

## References

### Core Techniques
1. Liu, Z., Zhao, C., Fedorov, I., et al. (2025). **"SpinQuant: LLM Quantization with Learned Rotations."** ICLR 2025. [[arXiv:2405.16406]](https://arxiv.org/abs/2405.16406) [[code]](https://github.com/facebookresearch/SpinQuant)
2. Google Research. (2026). **"Accelerating Gemini Nano Models on Pixel with Frozen Multi-Token Prediction."** [[blog]](https://research.google/blog/accelerating-gemini-nano-models-on-pixel-with-frozen-multi-token-prediction/)
3. Li, Y., Wei, F., Zhang, C., Zhang, H. (2025). **"EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test."** NeurIPS 2025. [[arXiv:2503.01840]](https://arxiv.org/abs/2503.01840)
4. Li, Y., et al. (2024). **"EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty."** ICML 2024. [[arXiv:2401.15077]](https://arxiv.org/abs/2401.15077)
5. PyTorch Foundation. (2025). **"ExecuTorch 1.0: Powering the Next Generation of Edge AI."** [[docs]](https://pytorch.org/executorch/)

### Agent Architectures
6. Yao, S., Zhao, J., Yu, D., et al. (2023). **"ReAct: Synergizing Reasoning and Acting in Language Models."** ICLR 2023. [[arXiv:2210.03629]](https://arxiv.org/abs/2210.03629)
7. OpenMinis. (2026). **"The AI Agent app across platforms."** [[GitHub]](https://github.com/OpenMinis/OpenMinis)
8. Li, S., et al. (2026). **"SpecForge: A Flexible and Efficient Open-Source Training Framework for Speculative Decoding."** ICML 2026. [[poster]](https://icml.cc/virtual/2026/poster/65558)

### Privacy & Security
9. ACM Computing Surveys. (2025). **"Empowering Edge Intelligence: A Comprehensive Survey on On-Device AI Models."** Vol. 57, Issue 9. [[DOI: 10.1145/3724420]](https://dl.acm.org/doi/10.1145/3724420)
10. (2026). **"Protecting On-Device AI Inference: A Systematic Review of Attacks and Defence Mechanisms."** [[arXiv:2605.29450]](https://arxiv.org/abs/2605.29450)
11. (2026). **"SoK: Attack and Defense Landscape of Mobile On-Device AI Systems."** [[arXiv:2607.00362]](https://arxiv.org/abs/2607.00362)

### Production Systems
12. Meta. (2024). **"Llama 3.2: Revolutionizing edge AI and vision with open, customizable models."** [[blog]](https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/)
13. Software Mansion. (2025–2026). **"react-native-executorch."** [[GitHub]](https://github.com/software-mansion/react-native-executorch)
14. Bacon, E. (2025). **"expo-ai-kit: Use on-device AI models inside Expo apps."** [[docs]](https://expo-ai-kit.dev)

---

## License

MIT — see [LICENSE](./LICENSE).

Built on infrastructure proven in [PrepAI](https://prepaihq.com). Research roadmap informed by the on-device AI community across Meta, Google, Software Mansion, Callstack, and the open-source agent ecosystem.

**This project bets that on-device AI agents are the next platform.**
