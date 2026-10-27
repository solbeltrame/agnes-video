<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { useProgress } from '@/composables/useProgress'

const props = defineProps<{ horizontal?: boolean }>()
const emit = defineEmits<{ (e: 'locate', stepKey: string): void }>()

const { steps, stepStates, awaitingCheckpoint } = useProgress()

// checkpoint -> 最近似的 step key（用于暂停时在时间线中高亮对应环节）
const CHECKPOINT_TO_STEP: Record<string, string> = {
  image_analysis: 'image_analysis',
  story: 'story',
  script: 'script',
  character_ref: 'character_ref',
  end_frame_prompts: 'end_frame_prompts',
  end_frame_gen: 'end_frame_gen',
  scenes: 'script',
  references: 'character_ref',
  videos: 'video_gen',
  audio: 'audio',
  subtitle: 'subtitle',
  final: 'concatenate',
}

const checkpointLabelKey: Record<string, string> = {
  image_analysis: 'cpImageAnalysis',
  story: 'cpStory',
  script: 'cpScript',
  character_ref: 'cpCharacterRef',
  end_frame_prompts: 'cpEndFramePrompts',
  end_frame_gen: 'cpEndFrameGen',
  scenes: 'cpScenes',
  references: 'cpReferences',
  videos: 'cpVideos',
  audio: 'cpAudio',
  subtitle: 'cpSubtitle',
  final: 'cpFinal',
}

type Item = { key: string; label: string; state: 'done' | 'running' | 'awaiting' | 'pending' }

const items = computed<Item[]>(() => {
  const cp = awaitingCheckpoint.value
  const highlightStep = cp ? CHECKPOINT_TO_STEP[cp] : ''
  const hasHighlight = cp && highlightStep && steps.value.some((s) => s.key === highlightStep)

  const list: Item[] = steps.value.map((s) => {
    let state: Item['state'] = stepStates.value[s.key] || 'pending'
    if (cp && hasHighlight && s.key === highlightStep) state = 'awaiting'
    return { key: s.key, label: t(s.labelKey), state }
  })

  // 暂停点无对应 step 时，在末尾追加独立条目
  if (cp && !hasHighlight) {
    list.push({ key: cp, label: t(checkpointLabelKey[cp] || cp), state: 'awaiting' })
  }
  return list
})

function onLocate(item: Item) {
  if (item.state !== 'pending') emit('locate', item.key)
}

function iconFor(state: Item['state']): string {
  if (state === 'done') return '✓'
  if (state === 'running') return '◉'
  if (state === 'awaiting') return '⏸'
  return '○'
}

function clsFor(state: Item['state']): string {
  if (state === 'done') return 'text-emerald-600'
  if (state === 'running') return 'text-violet-600'
  if (state === 'awaiting') return 'text-amber-700'
  return 'text-muted'
}
</script>

<template>
  <div v-if="!props.horizontal" class="rounded-2xl bg-paper">
    <div class="mb-3 px-2 text-xs font-semibold text-ink-2">{{ t('ppStages') }}</div>
    <div class="space-y-1">
      <button
        v-for="item in items"
        :key="item.key"
        class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition"
        :class="[
          item.state === 'awaiting' ? 'bg-amber-500/10 border border-amber-500/25' : 'hover:bg-violet-500/5 border border-transparent',
          item.state === 'running' ? 'bg-violet-500/5 border border-violet-500/15' : '',
        ]"
        @click="onLocate(item)"
      >
        <span
          class="w-4 text-center shrink-0"
          :class="[clsFor(item.state), item.state === 'running' ? 'animate-pulse' : '']"
        >{{ iconFor(item.state) }}</span>
        <span class="truncate" :class="item.state === 'awaiting' ? 'text-amber-700 font-medium' : 'text-ink-2'">{{ item.label }}</span>
        <span v-if="item.state === 'awaiting'" class="ml-auto shrink-0 text-[10px] text-amber-700">{{ t('ppWaiting') }}</span>
      </button>
    </div>
  </div>

  <!-- 移动端：横向滚动胶囊 -->
  <div v-else class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
    <button
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition"
      :class="[
        item.state === 'awaiting' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700' : 'bg-paper border-rule/60 text-ink-2',
        item.state === 'running' ? 'border-violet-400/50 text-violet-600' : '',
        item.state === 'done' ? 'text-emerald-600' : '',
      ]"
      @click="onLocate(item)"
    >
      <span :class="item.state === 'running' ? 'animate-pulse' : ''">{{ iconFor(item.state) }}</span>
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>
