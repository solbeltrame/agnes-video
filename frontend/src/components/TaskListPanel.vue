<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t, tf } from '@/i18n'
import { useTasks } from '@/composables/useTasks'
import { useConfirm } from '@/composables/useConfirm'
import { useModalA11y } from '@/composables/useModalA11y'
import RefreshIcon from '@/components/shared/RefreshIcon.vue'
import { getStepsForType } from '@/steps'
import { normalizeProgressMessage } from '@/utils/progressMessages'
import type { TaskListItem } from '@/types'

const props = withDefaults(defineProps<{ scope?: 'all' | 'recent' | 'completed' }>(), { scope: 'all' })
const emit = defineEmits<{ 'view-completed': []; 'open-task': [task: TaskListItem]; 'empty-change': [empty: boolean] }>()
const isRecentScope = computed(() => props.scope === 'recent')
const { tasks, loading, loadTaskList, resumeTask, stopTaskById, deleteTaskById, switchMode } = useTasks()
const { confirmAsync } = useConfirm()
const retryingTaskId = ref('')
const inputImagePreview = ref<{ src: string; label: string } | null>(null)
const inputImagePreviewOpen = computed(() => inputImagePreview.value !== null)
const { containerRef: inputImageModalRef } = useModalA11y(inputImagePreviewOpen, () => { inputImagePreview.value = null })
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

function taskUpdatedAt(task: TaskListItem): number {
  const fromState = Date.parse(task.updated_at || task.created_at || '')
  if (Number.isFinite(fromState)) return fromState
  const match = task.dir_name?.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!match) return 0
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime()
}

const displayedTasks = computed(() => {
  if (props.scope === 'completed') return tasks.value.filter((task) => task.status === 'completed')
  if (props.scope !== 'recent') return tasks.value
  const cutoff = Date.now() - RECENT_WINDOW_MS
  return tasks.value
    .filter((task) => {
      if (['running', 'queued', 'pending'].includes(task.status || '')) return true
      return ['completed', 'failed'].includes(task.status || '') && taskUpdatedAt(task) >= cutoff
    })
    .sort((a, b) => taskUpdatedAt(b) - taskUpdatedAt(a))
})

watch(
  () => [displayedTasks.value.length, loading.value] as const,
  ([count, isLoading]) => {
    if (!isLoading) emit('empty-change', count === 0)
  },
  { immediate: true },
)

async function toggleMode(task: TaskListItem) {
  const target = task.current_mode === 'manual' ? 'auto' : 'manual'
  if (!(await confirmAsync(target === 'auto' ? t('switchToAutoConfirm') : t('switchToManualConfirm')))) return
  const d = await switchMode(task.task_id, target as 'auto' | 'manual')
  if (d && task.awaiting_user && target === 'auto') {
    // 手动→自动：切换即继续（后端已 resume），刷新列表
    loadList()
  }
}

function loadList() {
  // useTasks 内部轮询 5s；此处立即刷新一次（1.7：收敛裸 fetch 到 useTasks，
  // 复用 in-flight 守卫与错误处理）
  void loadTaskList()
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-600',
  running: 'bg-amber-500/10 text-amber-600',
  failed: 'bg-red-500/10 text-red-600',
  pending: 'bg-paper-3 text-muted',
  queued: 'bg-violet-500/10 text-violet-600',
  retrying: 'bg-amber-500/10 text-amber-700',
  needsResume: 'bg-amber-500/10 text-amber-700',
}

const statusLabelKey: Record<string, string> = {
  completed: 'statusCompleted',
  running: 'statusRunning',
  failed: 'statusFailed',
  pending: 'statusPending',
  queued: 'statusQueued',
}

const typeLabelKey: Record<string, string> = {
  simple: 'typeSimple',
  creative: 'typeCreative',
  manuscript: 'typeManuscript',
  anchor: 'typeAnchor',
  poetry: 'typePoetry',
  image: 'typeImage',
}

function taskDesc(task: TaskListItem): string {
  return task.idea || task.prompt || (task.manuscript_text || '').substring(0, 80) || (task.script_text || '').substring(0, 80) || ''
}

function taskExtra(task: TaskListItem): string {
  if (task.scene_count) return ` · ${task.scene_count}${t('sceneUnit')}`
  if (task.paragraph_count) return ` · ${task.paragraph_count}${t('paraUnit')}`
  return ''
}

function isRunning(task: TaskListItem): boolean {
  return (task.status === 'running' || task.status === 'queued') && task.active === true
}

function isCompleted(task: TaskListItem): boolean {
  return task.status === 'completed'
}

function statusKey(task: TaskListItem): string {
  if (task.awaiting_user) return 'statusAwaitingUser'
  if (task.status === 'running' && task.current_message_key === 'progress.video.queue_full') return 'statusRetrying'
  if ((task.status === 'pending' || task.status === 'queued' || task.status === 'running') && task.active !== true) return 'statusNeedsResume'
  return statusLabelKey[task.status || ''] || ''
}

function statusTone(task: TaskListItem): string {
  const key = statusKey(task)
  if (key === 'statusRetrying') return statusColors.retrying
  if (key === 'statusNeedsResume') return statusColors.needsResume
  return statusColors[task.status || ''] || 'bg-paper-3 text-muted'
}

function taskStatusDetail(task: TaskListItem): string {
  // Uma tarefa concluída não deve continuar exibindo mensagens antigas de retry.
  if (isCompleted(task)) return ''
  const key = task.current_message_key || ''
  if (key === 'task.queued') return t('statusQueued')
  if (key) {
    const translated = tf(key, task.current_message_params || {})
    if (translated !== key) return normalizeProgressMessage(translated)
  }
  if (task.current_message && (task.status === 'failed' || !task.current_step)) return normalizeProgressMessage(task.current_message)
  if ((task.status === 'pending' || task.status === 'queued') && task.active === false) return t('taskNotRunningHint')
  if (task.current_step) {
    const stepKey = task.current_step.replace(/^step_/, '')
    const step = getStepsForType(task.task_type).find((item) => item.key === stepKey)
    if (step) {
      const pct = Number(task.current_progress)
      return `${t(step.labelKey)}${pct > 0 && pct < 1 ? ` · ${Math.round(pct * 100)}%` : ''}`
    }
  }
  return normalizeProgressMessage(task.current_message || '')
}

async function retryTask(task: TaskListItem) {
  if (retryingTaskId.value) return
  retryingTaskId.value = task.task_id
  try {
    await resumeTask(task.task_id)
  } finally {
    retryingTaskId.value = ''
  }
}

function mainBtnLabel(task: TaskListItem): string {
  if (isCompleted(task)) return t('btnView')
  if (isRunning(task)) return t('btnViewProgress')
  return t('btnResume')
}

function openInputImage(task: TaskListItem, frame: 'start' | 'end') {
  const src = frame === 'start' ? task.reference_image_url : task.end_frame_image_url
  if (!src) return
  const hasEndFrame = !!task.end_frame_image_url
  const description = frame === 'end' ? 'Imagem final' : hasEndFrame ? 'Imagem inicial' : 'Imagem de referência'
  const fileName = frame === 'start' ? task.reference_image_name : task.end_frame_image_name
  const label = `${description} · ${fileName || task.task_id}`
  inputImagePreview.value = { src, label }
}

function onMainBtn(task: TaskListItem) {
  if (isCompleted(task) || isRunning(task)) emit('open-task', task)
  else resumeTask(task.task_id)
}

function openTask(task: TaskListItem) {
  emit('open-task', task)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!isRecentScope" class="mb-4 flex items-center justify-between gap-3">
      <p class="text-sm text-muted">{{ scope === 'recent' ? tf('homeRecentCount', { count: displayedTasks.length }) : `${displayedTasks.length} ${displayedTasks.length === 1 ? 'tarefa' : 'tarefas'}` }}</p>
      <div class="flex items-center gap-2">
        <button v-if="scope === 'recent'" class="rounded-full px-3.5 py-2 text-xs font-medium text-violet-600 transition hover:bg-violet-500/10" @click="emit('view-completed')">{{ t('homeCompletedVideos') }} →</button>
        <button v-else class="inline-flex h-9 items-center gap-2 rounded-full border border-rule px-3.5 text-xs font-medium text-ink-2 transition hover:border-violet-400 hover:text-violet-500 disabled:cursor-wait disabled:opacity-50" :disabled="loading" @click="loadList">
          <RefreshIcon :class="{ 'animate-spin': loading }" /> Atualizar
        </button>
      </div>
    </div>
    <div v-if="loading && !displayedTasks.length" class="rounded-2xl border border-rule/70 bg-paper p-8 text-center text-sm text-muted">{{ isRecentScope ? t('homeRecentLoading') : 'Carregando seus vídeos…' }}</div>
    <div v-else-if="!displayedTasks.length" class="rounded-2xl border border-dashed border-rule bg-paper/70 px-5 py-12 text-center">
      <span class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl text-violet-500">✦</span>
      <p class="font-medium text-ink">{{ isRecentScope ? t('homeRecentEmpty') : t('noTasks') }}</p>
      <p v-if="scope === 'all'" class="mt-1 text-sm text-muted">Seus vídeos gerados aparecerão aqui.</p>
    </div>
    <div
      v-for="task in displayedTasks"
      :key="task.task_id"
      class="studio-task-card flex cursor-pointer flex-col gap-4 rounded-2xl border border-rule/70 bg-paper p-4 shadow-sm transition hover:border-violet-300/70 hover:shadow-md focus-visible:outline-none sm:p-5 lg:flex-row lg:items-center lg:justify-between"
      tabindex="0"
      @click="openTask(task)"
      @keydown.enter.self="openTask(task)"
      @keydown.space.self.prevent="openTask(task)"
    >
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <div v-if="task.reference_image_url || task.end_frame_image_url" class="w-[68px] shrink-0 pt-1">
          <div v-if="task.reference_image_url && task.end_frame_image_url" class="relative h-[70px] w-[68px]">
            <button type="button" class="absolute left-0 top-2 z-0 h-14 w-10 -rotate-[9deg] overflow-hidden rounded-lg border-2 border-paper bg-paper-3 shadow-md transition duration-200 hover:z-20 hover:scale-125 hover:rotate-0 hover:shadow-xl" aria-label="Ampliar imagem inicial" @click.stop="openInputImage(task, 'start')">
              <img :src="task.reference_image_url" alt="Imagem inicial" class="h-full w-full object-cover" loading="lazy" />
            </button>
            <button type="button" class="absolute right-0 top-2 z-10 h-14 w-10 rotate-[9deg] overflow-hidden rounded-lg border-2 border-paper bg-paper-3 shadow-md transition duration-200 hover:z-20 hover:scale-125 hover:rotate-0 hover:shadow-xl" aria-label="Ampliar imagem final" @click.stop="openInputImage(task, 'end')">
              <img :src="task.end_frame_image_url" alt="Imagem final" class="h-full w-full object-cover" loading="lazy" />
            </button>
          </div>
          <button v-else type="button" class="h-[70px] w-[60px] overflow-hidden rounded-xl border border-rule bg-paper-3 shadow-sm transition duration-200 hover:scale-110 hover:shadow-lg" :aria-label="task.reference_image_url ? 'Ampliar imagem de referência' : 'Ampliar imagem final'" @click.stop="openInputImage(task, task.reference_image_url ? 'start' : 'end')">
            <img :src="task.reference_image_url || task.end_frame_image_url" :alt="task.reference_image_url ? 'Imagem de referência' : 'Imagem final'" class="h-full w-full object-cover" loading="lazy" />
          </button>
        </div>
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-2">
            <p class="min-w-0 max-w-full truncate text-base font-semibold text-ink">{{ task.title || task.creative_name || task.task_id }}</p>
            <div class="inline-flex shrink-0 flex-wrap items-center gap-2">
              <span v-if="task.task_type !== 'simple'" class="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-600">
                {{ t(typeLabelKey[task.task_type || ''] || '') || task.task_type }}
              </span>
              <span class="rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="statusTone(task)">
                {{ t(statusKey(task)) || task.status }}
              </span>
              <!-- v6.0 模式徽标 -->
              <span v-if="task.awaiting_user" class="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600">
                {{ t('awaitingUser') }}
              </span>
              <span v-else-if="task.current_mode === 'manual'" class="rounded-full bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-600">
                ✋ {{ t('execManual') }}
              </span>
            </div>
          </div>
          <p class="mt-1 truncate text-xs text-muted">{{ taskDesc(task) || task.task_id }}{{ taskExtra(task) }}</p>
          <p v-if="taskStatusDetail(task)" class="mt-2 line-clamp-2 text-xs leading-5" :class="isRecentScope ? 'text-white' : task.status === 'failed' ? 'text-red-600' : task.current_message_key === 'progress.video.queue_full' ? 'text-amber-700' : 'text-muted'">
            {{ taskStatusDetail(task) }}
          </p>
          <p class="mt-1 truncate font-mono text-[10px] text-muted/70">{{ task.task_id }}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 lg:justify-end">
        <!-- v6.0 运行时切换（已完成/失败任务不显示） -->
        <button
          v-if="task.current_mode && !isCompleted(task) && task.status !== 'failed' && task.task_type !== 'simple' && task.task_type !== 'image'"
          class="text-xs px-2.5 py-1.5 rounded-lg transition border border-rule text-ink-2 hover:border-accent/40"
          :title="t(task.current_mode === 'manual' ? 'switchToAuto' : 'switchToManual')"
          @click.stop="toggleMode(task)"
        >
          {{ task.current_mode === 'manual' ? t('switchToAuto') : t('switchToManual') }}
        </button>
        <button
          v-if="!isCompleted(task) && !isRunning(task)"
          class="text-xs px-3 py-1.5 bg-paper-3 hover:bg-paper-3 rounded-lg transition"
          @click.stop="openTask(task)"
        >
          {{ t('btnView') }}
        </button>
        <button
          v-if="task.status === 'failed'"
          class="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
          :disabled="!!retryingTaskId"
          @click.stop="retryTask(task)"
        >
          <RefreshIcon :class="{ 'animate-spin': retryingTaskId === task.task_id }" />
          {{ retryingTaskId === task.task_id ? t('resuming') : t('fbRetryBtn') }}
        </button>
        <button
          v-else
          class="text-xs px-3 py-1.5 rounded-lg transition"
          :class="isCompleted(task) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-accent text-accent-ink hover:bg-accent/90'"
          @click.stop="onMainBtn(task)"
        >
          {{ mainBtnLabel(task) }}
        </button>
        <button
          v-if="isRunning(task)"
          class="text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 text-red-100 rounded-lg transition"
          @click.stop="stopTaskById(task.task_id)"
        >
          {{ t('btnStop') }}
        </button>
        <button
          v-if="!isRunning(task)"
          class="text-xs px-3 py-1.5 bg-red-900/60 hover:bg-red-700 text-red-200 rounded-lg transition"
          @click.stop="deleteTaskById(task.task_id)"
        >
          {{ t('deleteTask') }}
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="inputImagePreview" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" @click.self="inputImagePreview = null">
        <div ref="inputImageModalRef" class="relative w-full max-w-4xl rounded-2xl bg-paper p-3 shadow-2xl sm:p-4" role="dialog" aria-modal="true" :aria-label="inputImagePreview.label">
          <button type="button" class="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium text-white hover:bg-black/75" aria-label="Fechar imagem ampliada" @click="inputImagePreview = null">×</button>
          <img :src="inputImagePreview.src" :alt="inputImagePreview.label" class="mx-auto max-h-[80vh] w-full rounded-xl object-contain" />
          <p class="mt-3 px-1 text-sm font-medium text-ink">{{ inputImagePreview.label }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
