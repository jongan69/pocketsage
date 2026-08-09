import React from 'react';
import { View, Text, Modal, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, Trash2, Cpu } from 'lucide-react-native';
import { BUILT_IN_MODELS } from '@pocketsage/agent-runtime';
import type { ModelInfo, ModelDownloadState } from '@pocketsage/agent-runtime';
import { useModelStore } from '@/stores/model-store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { DownloadProgress } from './DownloadProgress';

interface ModelPickerProps {
  visible: boolean;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function tierLabel(tier: ModelInfo['tier']): string {
  return tier === 'fast' ? 'Fast' : 'Powerful';
}

/** Bottom-sheet picker for downloading and selecting an on-device model. */
export const ModelPicker = React.memo(function ModelPicker({
  visible,
  onClose,
}: ModelPickerProps) {
  const store = useModelStore();
  const models = store.models.length > 0 ? store.models : BUILT_IN_MODELS;
  const activeId = store.activeModelId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-surface">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface-tertiary">
          <View>
            <Text className="text-text-primary text-lg font-bold">Choose your model</Text>
            <Text className="text-text-muted text-xs mt-0.5">
              Downloads once, runs fully on-device
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close" className="p-2 -mr-2">
            <X size={22} color="#a3a3a3" />
          </Pressable>
        </View>

        {/* Body */}
        {!store.isInitialized ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
            <Text className="text-text-secondary mt-4 text-sm">Loading models…</Text>
          </View>
        ) : (
          <FlatList
            className="flex-1 px-4"
            contentContainerStyle={{ paddingVertical: 16 }}
            data={models}
            keyExtractor={(model) => model.id}
            renderItem={({ item }) => (
              <ModelRow
                model={item}
                state={store.downloadStates[item.id] ?? { status: 'not_downloaded' }}
                isActive={activeId === item.id}
                onSelect={() => void store.setActiveModel(item.id)}
                onDownload={() => void store.downloadModel(item.id)}
                onCancelDownload={() => void store.cancelDownload(item.id)}
                onDelete={() => void store.deleteModel(item.id)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
});

interface ModelRowProps {
  model: ModelInfo;
  state: ModelDownloadState;
  isActive: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onCancelDownload: () => void;
  onDelete: () => void;
}

function ModelRow({
  model,
  state,
  isActive,
  onSelect,
  onDownload,
  onCancelDownload,
  onDelete,
}: ModelRowProps) {
  const downloading = state.status === 'downloading';
  const downloaded = state.status === 'downloaded';

  return (
    <Pressable
      onPress={downloaded ? onSelect : undefined}
      disabled={!downloaded}
      accessibilityRole="button"
      className={`bg-surface-secondary rounded-xl p-4 mb-3 border-2 ${
        isActive ? 'border-accent' : 'border-transparent'
      }`}
    >
      {/* Top row: radio + name + badges */}
      <View className="flex-row items-center">
        {/* Radio */}
        <View
          className={`w-5 h-5 rounded-full items-center justify-center mr-3 ${
            isActive ? 'bg-accent' : 'border-2 border-text-muted'
          }`}
        >
          {isActive && <Check size={12} color="#ffffff" />}
        </View>

        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-base">
            {model.name.replace(' SpinQuant', '')}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Badge variant={model.tier === 'fast' ? 'default' : 'warning'}>
              {tierLabel(model.tier)}
            </Badge>
            <Text className="text-text-muted text-xs">{formatSize(model.sizeBytes)}</Text>
            <Text className="text-text-muted text-xs">·</Text>
            <Text className="text-text-muted text-xs">{model.parameterCount}</Text>
          </View>
        </View>

        {isActive && (
          <Badge variant="success">
            <View className="flex-row items-center">
              <Cpu size={10} color="#22c55e" className="mr-1" />
              Active
            </View>
          </Badge>
        )}
      </View>

      {/* Status area */}
      <View className="mt-4">
        {state.status === 'not_downloaded' && (
          <Button variant="primary" size="sm" onPress={onDownload} className="self-start">
            Download · {formatSize(model.sizeBytes)}
          </Button>
        )}

        {downloading && (
          <DownloadProgress
            progress={state.progress ?? 0}
            label="Downloading…"
            onCancel={onCancelDownload}
          />
        )}

        {state.status === 'error' && (
          <View>
            <Text className="text-danger text-sm mb-2">
              Download failed{state.message ? `: ${state.message}` : ''}
            </Text>
            <Button variant="primary" size="sm" onPress={onDownload} className="self-start">
              Retry download
            </Button>
          </View>
        )}

        {downloaded && !isActive && (
          <View className="flex-row items-center justify-between">
            <Text className="text-text-muted text-xs">Tap to use this model</Text>
            <Pressable onPress={onDelete} className="p-1" accessibilityLabel={`Delete ${model.name}`}>
              <Trash2 size={16} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}
