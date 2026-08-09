import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check, Zap } from 'lucide-react-native';
import { BUILT_IN_MODELS } from '@pocketsage/agent-runtime';
import type { ModelInfo, ModelDownloadState } from '@pocketsage/agent-runtime';
import { useModelStore } from '@/stores/model-store';
import { DownloadProgress } from '@/components/models/DownloadProgress';

interface ModelDownloadStepProps {
  /** Called when the user skips the download and continues anyway. */
  onSkip: () => void;
}

function formatSize(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

/** Onboarding step 2: pick a model size and start the download. */
export function ModelDownloadStep({ onSkip }: ModelDownloadStepProps) {
  const store = useModelStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const models = store.models.length > 0 ? store.models : BUILT_IN_MODELS;

  return (
    <View className="flex-1 justify-center pb-6">
      <Text className="text-text-primary text-3xl font-bold text-center leading-tight">
        Choose your model
      </Text>
      <Text className="text-text-secondary text-base text-center leading-relaxed mt-3 px-2 mb-6">
        Download once, use forever. The model runs on your phone — no cloud needed.
      </Text>

      <View className="gap-3">
        {models.map((model) => (
          <ModelOption
            key={model.id}
            model={model}
            state={store.downloadStates[model.id] ?? { status: 'not_downloaded' }}
            selected={selectedId === model.id}
            onTap={() => {
              setSelectedId(model.id);
              if (store.downloadStates[model.id]?.status === 'downloaded') return;
              void store.downloadModel(model.id);
            }}
            onCancel={() => void store.cancelDownload(model.id)}
            onRetry={() => void store.downloadModel(model.id)}
          />
        ))}
      </View>

      <Pressable onPress={onSkip} accessibilityRole="button" className="mt-6 py-2 self-center">
        <Text className="text-text-muted text-sm">Skip for now — start without a model</Text>
      </Pressable>
    </View>
  );
}

interface ModelOptionProps {
  model: ModelInfo;
  state: ModelDownloadState;
  selected: boolean;
  onTap: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

function ModelOption({ model, state, selected, onTap, onCancel, onRetry }: ModelOptionProps) {
  const downloading = state.status === 'downloading';
  const downloaded = state.status === 'downloaded';
  const tierLabel = model.tier === 'fast' ? 'Fast' : 'Powerful';

  return (
    <Pressable
      onPress={downloading ? undefined : onTap}
      disabled={downloading}
      accessibilityRole="button"
      accessibilityLabel={`${model.name}, ${tierLabel}, ${formatSize(model.sizeBytes)}`}
      className={`bg-surface-secondary rounded-2xl p-4 border-2 ${
        selected ? 'border-accent' : 'border-transparent'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary font-semibold text-lg">
          {model.name.replace(' SpinQuant', '')}
        </Text>
        <Text className="text-text-secondary text-sm">{formatSize(model.sizeBytes)}</Text>
      </View>

      <View className="flex-row items-center gap-2 mt-1">
        <View className="flex-row items-center bg-surface-tertiary rounded-full px-2.5 py-1">
          <Zap size={11} color="#f59e0b" className="mr-1" />
          <Text className="text-text-secondary text-xs font-medium">{tierLabel}</Text>
        </View>
        <Text className="text-text-muted text-xs">{model.parameterCount} parameters</Text>
      </View>

      {/* Status */}
      <View className="mt-3">
        {downloading && (
          <DownloadProgress progress={state.progress ?? 0} label="Downloading…" onCancel={onCancel} />
        )}

        {downloaded && (
          <View className="flex-row items-center">
            <Check size={14} color="#22c55e" />
            <Text className="text-success text-sm font-medium ml-1.5">Ready to use</Text>
          </View>
        )}

        {state.status === 'error' && (
          <View className="flex-row items-center justify-between">
            <Text className="text-danger text-sm">Download failed</Text>
            <Pressable onPress={onRetry} className="px-3 py-1 rounded-full bg-accent">
              <Text className="text-white text-xs font-semibold">Retry</Text>
            </Pressable>
          </View>
        )}

        {state.status === 'not_downloaded' && (
          <Text className="text-text-muted text-xs">Tap to download</Text>
        )}
      </View>
    </Pressable>
  );
}
