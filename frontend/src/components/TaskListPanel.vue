<script setup lang="ts">
import { computed, ref } from 'vue'
import { t, tf } from '@/i18n'
import { useTasks } from '@/composables/useTasks'
import { useConfirm } from '@/composables/useConfirm'
import { getStepsForType } from '@/steps'
import type { TaskListItem } from '@/types'

const { tasks, loading, loadTaskList, viewTask, viewRunningTask, resumeTask, stopTaskById, deleteTaskById, switchMode } = useTasks()
const { confirmAsync } = useConfirm()
const retryingTaskId = ref('')

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
  return (task.status === 'running' || task.status === 'queued') && task.active !== false
}

function isCompleted(task: TaskListItem): boolean {
  return task.status === 'completed'
}

function statusKey(task: TaskListItem): string {
  if (task.awaiting_user) return 'statusAwaitingUser'
  if (task.status === 'running' && task.current_message_key === 'progress.video.queue_full') return 'statusRetrying'
  if ((task.status === 'pending' || task.status === 'queued' || task.status === 'running') && task.active === false) return 'statusNeedsResume'
  return statusLabelKey[task.status || ''] || ''
}

function statusTone(task: TaskListItem): string {
  const key = statusKey(task)
  if (key === 'statusRetrying') return statusColors.retrying
  if (key === 'statusNeedsResume') return statusColors.needsResume
  return statusColors[task.status || ''] || 'bg-paper-3 text-muted'
}

function taskStatusDetail(task: TaskListItem): string {
  const key = task.current_message_key || ''
  if (key === 'task.queued') return t('statusQueued')
  if (key) {
    const translated = tf(key, task.current_message_params || {})
    if (translated !== key) return translated
  }
  if (task.current_message && (task.status === 'failed' || !task.current_step)) return task.current_message
  if ((task.status === 'pending' || task.status === 'queued') && task.active === false) return t('taskNotRunningHint')
  if (task.current_step) {
    const stepKey = task.current_step.replace(/^step_/, '')
    const step = getStepsForType(task.task_type).find((item) => item.key === stepKey)
    if (step) {
      const pct = Number(task.current_progress)
      return `${t(step.labelKey)}${pct > 0 && pct < 1 ? ` · ${Math.round(pct * 100)}%` : ''}`
    }
  }
  return task.current_message || ''
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

function onMainBtn(task: TaskListItem) {
  if (isCompleted(task)) viewTask(task.task_id)
  else if (isRunning(task)) viewRunningTask(task.task_id)
  else resumeTask(task.task_id)
}
</script>

<template>
  <div class="space-y-3">
    <div class="mb-4 flex items-center justify-between gap-3">
      <p class="text-sm text-muted">{{ tasks.length }} {{ tasks.length === 1 ? 'tarefa' : 'tarefas' }}</p>
      <button class="rounded-full border border-rule px-3.5 py-2 text-xs font-medium text-ink-2 transition hover:border-violet-400 hover:text-violet-500 disabled:opacity-50" :disabled="loading" @click="loadList">
        <span :class="loading ? 'inline-block animate-spin' : ''">↻</span> Atualizar
      </button>
    </div>
    <div v-if="loading && !tasks.length" class="rounded-2xl border border-rule/70 bg-paper p-8 text-center text-sm text-muted">Carregando seus vídeos…</div>
    <div v-else-if="!tasks.length" class="rounded-2xl border border-dashed border-rule bg-paper/70 px-5 py-12 text-center">
      <span class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl text-violet-500">✦</span>
      <p class="font-medium text-ink">{{ t('noTasks') }}</p>
      <p class="mt-1 text-sm text-muted">Seus vídeos gerados aparecerão aqui.</p>
    </div>
    <div
      v-for="task in tasks"
      :key="task.task_id"
      class="studio-task-card flex flex-col gap-4 rounded-2xl border border-rule/70 bg-paper p-4 shadow-sm transition hover:border-violet-300/70 hover:shadow-md sm:p-5 lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="flex-1 min-w-0">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <span class="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-600">
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
        <p class="truncate text-base font-semibold text-ink">{{ task.creative_name || task.task_id }}</p>
        <p class="mt-1 truncate text-xs text-muted">{{ taskDesc(task) || task.task_id }}{{ taskExtra(task) }}</p>
        <p v-if="taskStatusDetail(task)" class="mt-2 line-clamp-2 text-xs leading-5" :class="task.status === 'failed' ? 'text-red-600' : task.current_message_key === 'progress.video.queue_full' ? 'text-amber-700' : 'text-muted'">
          {{ taskStatusDetail(task) }}
        </p>
        <p class="mt-1 truncate font-mono text-[10px] text-muted/70">{{ task.task_id }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 lg:justify-end">
        <!-- v6.0 运行时切换（已完成/失败任务不显示） -->
        <button
          v-if="task.current_mode && !isCompleted(task) && task.status !== 'failed' && task.task_type !== 'simple' && task.task_type !== 'image'"
          class="text-xs px-2.5 py-1.5 rounded-lg transition border border-rule text-ink-2 hover:border-accent/40"
          :title="t(task.current_mode === 'manual' ? 'switchToAuto' : 'switchToManual')"
          @click="toggleMode(task)"
        >
          {{ task.current_mode === 'manual' ? t('switchToAuto') : t('switchToManual') }}
        </button>
        <button
          v-if="!isCompleted(task) && !isRunning(task)"
          class="text-xs px-3 py-1.5 bg-paper-3 hover:bg-paper-3 rounded-lg transition"
          @click="viewTask(task.task_id)"
        >
          {{ t('btnView') }}
        </button>
        <button
          v-if="task.status === 'failed'"
          class="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
          :disabled="!!retryingTaskId"
          @click="retryTask(task)"
        >
          <span :class="retryingTaskId === task.task_id ? 'inline-block animate-spin' : ''">↻</span>
          {{ retryingTaskId === task.task_id ? t('resuming') : t('fbRetryBtn') }}
        </button>
        <button v-else class="text-xs px-3 py-1.5 bg-accent text-accent-ink hover:bg-accent/90 rounded-lg transition" @click="onMainBtn(task)">
          {{ mainBtnLabel(task) }}
        </button>
        <button
          v-if="isRunning(task)"
          class="text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 text-red-100 rounded-lg transition"
          @click="stopTaskById(task.task_id)"
        >
          {{ t('btnStop') }}
        </button>
        <button
          v-if="!isRunning(task)"
          class="text-xs px-3 py-1.5 bg-red-900/60 hover:bg-red-700 text-red-200 rounded-lg transition"
          @click="deleteTaskById(task.task_id)"
        >
          {{ t('deleteTask') }}
        </button>
      </div>
    </div>
  </div>
</template>
