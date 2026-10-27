<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { appState } from '@/store'
import { useProgress } from '@/composables/useProgress'
import { useTasks } from '@/composables/useTasks'
import { useNavigation } from '@/composables/useNavigation'
import LangSwitcher from '@/components/shared/LangSwitcher.vue'

const props = withDefaults(defineProps<{ taskTitle?: string; embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ close: [] }>()
const { progressPct, awaitingCheckpoint, taskFailed, needsResume } = useProgress()
const { stopTaskById, switchMode } = useTasks()
const { goBack, goHome } = useNavigation()

const taskId = computed(() => appState.currentTaskId || appState.progressTaskId || '')
const displayTitle = computed(() => props.taskTitle?.trim() || `${t('task_')} ${taskId.value}`)
const dirName = computed(() => appState.currentDirName || '')

const typeLabelKey: Record<string, string> = {
  simple: 'typeSimple',
  creative: 'typeCreative',
  manuscript: 'typeManuscript',
  anchor: 'typeAnchor',
  poetry: 'typePoetry',
  image: 'typeImage',
}

const statusInfo = computed(() => {
  if (taskFailed.value) return { key: 'statusFailed', cls: 'text-red-600 bg-red-500/10 border-red-500/20' }
  if (needsResume.value) return { key: 'statusNeedsResume', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/25' }
  if (awaitingCheckpoint.value) return { key: 'statusAwaitingUser', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/25' }
  if (appState.isTaskRunning || progressPct.value > 0 && progressPct.value < 100) {
    return { key: 'statusRunning', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/25' }
  }
  return { key: 'statusCompleted', cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20' }
})

function onBack() {
  if (props.embedded) emit('close')
  else goBack()
}

function onHome() {
  goHome()
}

async function onStop() {
  if (taskId.value) await stopTaskById(taskId.value)
}

async function onSwitchAuto() {
  if (taskId.value) await switchMode(taskId.value, 'auto')
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-rule/50 bg-paper/85 backdrop-blur-xl">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
      <button v-if="!props.embedded" class="flex shrink-0 items-center gap-2.5 text-left" :title="t('goHome')" @click="onHome">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-lg text-white shadow-md shadow-violet-600/20">✦</span>
        <span class="hidden text-sm font-semibold tracking-tight text-ink sm:inline">Agnes Studio</span>
      </button>
      <span v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-lg text-white shadow-md shadow-violet-600/20">✦</span>

      <span class="h-7 w-px bg-rule/70"></span>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-600">
          {{ t(typeLabelKey[appState.currentTaskType] || '') || appState.currentTaskType }}
          </span>
          <span class="truncate text-sm font-semibold text-ink" :title="displayTitle">{{ displayTitle }}</span>
        </div>
        <span v-if="dirName" class="mt-0.5 hidden truncate text-[10px] text-muted sm:block">{{ dirName }}</span>
      </div>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <LangSwitcher v-if="!props.embedded" compact />
        <span class="rounded-full border px-2.5 py-1 text-[11px] font-semibold" :class="statusInfo.cls">
          {{ t(statusInfo.key) }}
        </span>
        <button
          v-if="awaitingCheckpoint"
          class="rounded-full border border-rule px-3.5 py-2 text-xs font-medium text-ink-2 transition hover:border-violet-400 hover:text-violet-600"
          @click="onSwitchAuto"
        >
          ⚡ {{ t('switchToAuto') }}
        </button>
        <button
          v-if="appState.isTaskRunning"
          class="rounded-full bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="onStop"
        >
          {{ t('stopTask') }}
        </button>
      </div>
      <button v-if="props.embedded" class="order-last flex h-9 w-9 items-center justify-center rounded-full border border-rule text-xl text-muted transition hover:bg-paper-3 hover:text-ink sm:order-none sm:ml-auto" :aria-label="t('progressBack')" @click="onBack">×</button>
      <button v-else class="order-last w-full text-left text-xs text-muted transition hover:text-violet-500 sm:order-none sm:ml-auto sm:w-auto" @click="onBack">← {{ t('progressBack') }}</button>
    </div>
  </header>
</template>
