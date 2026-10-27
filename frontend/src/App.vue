<script setup lang="ts">
import { nextTick, ref, onMounted, onUnmounted } from 'vue'
import { t } from '@/i18n'
import { useTheme } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'
import { useConfig } from '@/composables/useConfig'
import { useVoice } from '@/composables/useVoice'
import { useTasks } from '@/composables/useTasks'
import { useProgress } from '@/composables/useProgress'
import { useNavigation } from '@/composables/useNavigation'
import { useGallery } from '@/composables/useGallery'
import { appState } from '@/store'
import ConfigPanel from '@/components/ConfigPanel.vue'
import CreatePanel from '@/components/CreatePanel.vue'
import SimplePanel from '@/components/SimplePanel.vue'
import TaskListPanel from '@/components/TaskListPanel.vue'
import GalleryPanel from '@/components/GalleryPanel.vue'
import ProgressPage from '@/components/ProgressPage.vue'
import VoicePickerModal from '@/components/VoicePickerModal.vue'
import Toast from '@/components/Toast.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LangSwitcher from '@/components/shared/LangSwitcher.vue'
import QuickVideoPanel from '@/components/QuickVideoPanel.vue'
import ApiKeyModal from '@/components/ApiKeyModal.vue'
import SettingsIcon from '@/components/shared/SettingsIcon.vue'
import { useModalA11y } from '@/composables/useModalA11y'
import * as api from '@/api'
import type { TaskListItem } from '@/types'

const { themeIcon, themeLabel, cycleTheme } = useTheme()
const { visible: toastVisible, message: toastMessage, type: toastType, showToast } = useToast()
const { loadModels, renderWorkspaces } = useConfig()
const { initVoiceSelector } = useVoice()
const { loadTaskList, startTaskListTimer, stopTaskListTimer } = useTasks()
const { parseHash } = useNavigation()
const { loadGallery, startGalleryTimer, stopGalleryTimer } = useGallery()
const advancedMode = ref(false)
const apiKeyModalOpen = ref(false)
const recentTasksEmpty = ref(true)
const completedVideosOpen = ref(false)
const taskDetailsOpen = ref(false)
const { containerRef: completedVideosModalRef } = useModalA11y(completedVideosOpen, () => { completedVideosOpen.value = false })
const { containerRef: taskDetailsModalRef } = useModalA11y(taskDetailsOpen, () => { void closeTaskDetails() })

function openCompletedVideos() {
  completedVideosOpen.value = true
}

function openTaskDetails(task: TaskListItem) {
  completedVideosOpen.value = false
  setTaskDetails(task.task_id, task)
}

function setTaskDetails(taskId: string, task: Partial<TaskListItem> = {}) {
  appState.progressTaskId = taskId
  appState.currentTaskId = taskId
  appState.currentDirName = task.dir_name || taskId
  appState.currentTaskType = task.task_type || 'creative'
  appState.currentArtifactsTaskId = taskId
  taskDetailsOpen.value = true
}

async function openTaskProgressModal(taskId: string) {
  try {
    const task = await api.getTask(taskId)
    setTaskDetails(taskId, task)
  } catch (error: any) {
    showToast(t('failLoad') + ': ' + (error?.message || ''), 4500)
  }
}

function handleOpenTaskProgress(event: Event) {
  const detail = (event as CustomEvent<{ taskId?: string; origin?: 'create' | 'list' | 'gallery' }>).detail
  if (!detail?.taskId) return
  appState.progressOrigin = detail.origin || 'create'
  void openTaskProgressModal(detail.taskId)
}

async function closeTaskDetails() {
  taskDetailsOpen.value = false
  await nextTick()
  appState.progressTaskId = null
  appState.currentTaskId = null
  appState.currentDirName = null
  appState.currentArtifactsTaskId = null
  if (location.hash.startsWith('#/progress/')) location.hash = '#/create'
}

function switchMainTab(tab: 'create' | 'list' | 'simple' | 'gallery') {
  appState.view = tab
  if (tab === 'create') advancedMode.value = true
  else if (tab === 'list') advancedMode.value = false
  location.hash =
    tab === 'list' ? '#/list' : tab === 'simple' ? '#/simple' : tab === 'gallery' ? '#/gallery' : '#/create'
  if (tab === 'list') {
    loadTaskList()
    startTaskListTimer()
  } else if (tab === 'gallery') {
    loadGallery()
    startGalleryTimer()
  } else {
    stopTaskListTimer()
    stopGalleryTimer()
  }
}

function returnToQuickMode() {
  advancedMode.value = false
  appState.view = 'create'
  loadTaskList()
  startTaskListTimer()
  location.hash = '#/create'
}

function openQuickHome() {
  advancedMode.value = false
  appState.view = 'create'
  loadTaskList()
  startTaskListTimer()
  stopGalleryTimer()
  location.hash = '#/create'
}

const isConfigLoaded = ref(false)

onMounted(async () => {
  window.addEventListener('agnes:open-task-progress', handleOpenTaskProgress)
  // 解析 hash：直达进度页 / 列表页（刷新保留视图）
  const parsed = parseHash()
  if (parsed.view === 'progress' && parsed.taskId) {
    appState.view = 'create'
    openTaskProgressModal(parsed.taskId)
    loadTaskList()
    startTaskListTimer()
  } else {
    appState.view = parsed.view
    if (parsed.view === 'gallery') {
      loadGallery()
      startGalleryTimer()
    } else if (parsed.view === 'list' || parsed.view === 'create') {
      loadTaskList()
      startTaskListTimer()
    }
  }

  try {
    const cfg = await fetch('/api/config').then((r) => r.json())
    if (cfg.api_key) {
      appState.apiKeySource = cfg.source
    }
    // v6.1 问题反馈：记录应用版本（诊断信息用；缺失时 FeedbackPanel 自兜底拉取）
    if (cfg.app_version) {
      appState.appVersion = cfg.app_version
    }
    await renderWorkspaces()
    if (cfg.watermark !== undefined) {
      appState.watermarkEnabled = !!cfg.watermark.enabled
    }
    if (cfg.agnes_domain) {
      appState.agnesDomain = cfg.agnes_domain
    }
    await loadModels()
    isConfigLoaded.value = true
  } catch (e) {
    console.error('init config load error:', e)
  }

  try {
    await initVoiceSelector()
  } catch (e) {
    console.error('init voice selector error:', e)
  }

})

onUnmounted(() => {
  window.removeEventListener('agnes:open-task-progress', handleOpenTaskProgress)
})
</script>

<template>
  <ProgressPage v-if="appState.view === 'progress'" />

  <main v-else-if="appState.view === 'create' && !advancedMode" class="studio-shell min-h-[100dvh] px-3 pb-[320px] sm:px-5 sm:pb-[300px]">
    <div class="sticky top-0 z-30 -mx-3 bg-paper/95 px-3 pt-4 backdrop-blur-xl sm:-mx-5 sm:px-5 sm:pt-5">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 pb-3">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-xl text-white shadow-lg shadow-violet-600/20">✦</div>
        <span class="text-base font-semibold tracking-tight text-ink sm:text-lg">Agnes Studio</span>
      </div>
      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <button class="inline-flex items-center rounded-full px-3 py-2 text-xs text-ink-2 transition hover:bg-violet-500/10 hover:text-violet-500" @click="openCompletedVideos">Meus vídeos</button>
        <button class="inline-flex items-center rounded-full px-2 py-2 text-[11px] text-ink-2 transition hover:bg-violet-500/10 hover:text-violet-500 sm:px-3 sm:text-xs" @click="advancedMode = true">Modo Avançado</button>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule text-ink-2 transition hover:border-violet-400 hover:bg-violet-500/10 hover:text-violet-600"
          :aria-label="t('quickApiKeyButton')"
          :title="t('quickApiKeyButton')"
          @click="apiKeyModalOpen = true"
        >
          <SettingsIcon />
        </button>
        <LangSwitcher />
      </div>
    </header>
    </div>
    <section class="mx-auto w-full max-w-5xl">
      <div v-show="recentTasksEmpty" class="mx-auto max-w-3xl pt-12 text-center sm:pt-20">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Criação de vídeo com IA</p>
        <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Sua ideia em movimento</h1>
        <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">Descreva o que você imagina e deixe a Agnes criar o vídeo.</p>
      </div>
      <div v-show="!recentTasksEmpty">
        <div class="pt-5 sm:pt-7">
          <TaskListPanel scope="recent" @view-completed="openCompletedVideos" @open-task="openTaskDetails" @empty-change="recentTasksEmpty = $event" />
        </div>
      </div>
    </section>
    <QuickVideoPanel :models-ready="isConfigLoaded" />
  </main>

  <main v-else-if="appState.view === 'list' && !advancedMode" class="studio-shell min-h-screen px-4 py-5 sm:px-6 sm:py-8">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 pb-8">
      <button class="flex items-center gap-3 text-left" @click="openQuickHome">
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-xl text-white shadow-lg shadow-violet-600/20">✦</span>
        <span class="text-lg font-semibold tracking-tight text-ink">Agnes Studio</span>
      </button>
      <div class="flex items-center gap-2">
        <button class="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700" @click="openQuickHome">＋ Novo vídeo</button>
        <LangSwitcher />
      </div>
    </header>
    <section class="mx-auto max-w-5xl">
      <div class="mb-6">
        <p class="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Agnes Studio</p>
        <h1 class="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Meus vídeos</h1>
        <p class="mt-2 text-sm text-muted">Histórico completo das suas tarefas.</p>
      </div>
      <TaskListPanel scope="all" @open-task="openTaskDetails" />
    </section>
  </main>

  <div v-else class="flex justify-center gap-3 px-4">
    <!-- Left sidebar -->
    <aside class="hidden lg:block sticky top-[120px] self-start w-[130px] shrink-0 mt-8">
      <div class="sidebar-card">
        <div class="stitle">{{ t('adSupportTitle') }}</div>
        <p class="text-muted text-xs leading-relaxed mb-2">{{ t('adSupportDesc') }}</p>
        <a href="https://github.com/lcy362/agnes-video-generator" target="_blank" rel="noopener">{{ t('adStar') }}</a>
        <p class="text-muted text-xs px-1 -mt-0.5 mb-1">{{ t('adStarDesc') }}</p>
        <a href="https://github.com/lcy362/flint" target="_blank" rel="noopener" class="wrap">{{ t('adSkewStar') }}</a>
        <p class="text-muted text-xs px-1 -mt-0.5 mb-1">{{ t('adSkewStarDesc') }}</p>
        <a href="https://video.lichuanyang.top" target="_blank" rel="noopener">{{ t('adAdblock') }}</a>
        <p class="text-muted text-xs px-1 -mt-0.5 mb-1">{{ t('adAdblockDesc') }}</p>
        <a href="https://video.lichuanyang.top" target="_blank" rel="noopener">{{ t('adClick') }}</a>
        <p class="text-muted text-xs px-1 -mt-0.5 mb-1">{{ t('adClickDesc') }}</p>
        <p class="text-muted text-xs mt-2 leading-relaxed">{{ t('adThanks') }}</p>
      </div>
    </aside>

    <!-- Main content -->
    <div class="max-w-4xl flex-1 min-w-0 py-8">
      <!-- Header -->
      <div class="text-center mb-10">
        <div class="flex items-center justify-end gap-1 mb-5">
          <button
            class="flex items-center gap-1.5 px-2.5 py-2 text-sm text-ink-2 hover:text-ink hover:bg-paper-2 rounded-lg transition-colors"
            :title="themeLabel"
            :aria-label="themeLabel"
            @click="cycleTheme"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="themeIcon"></path>
            </svg>
            <span class="text-xs whitespace-nowrap">{{ themeLabel }}</span>
          </button>
          <LangSwitcher />
        </div>
        <h1 class="text-2xl sm:text-4xl font-bold text-ink px-2" style="position: relative; z-index: 0">Agnes Video Generator</h1>
        <p class="text-muted mt-2 text-sm tracking-wide px-2">{{ t('subtitle') }}</p>
      </div>

      <!-- Resource links（窄屏可换行） -->
      <nav class="flex justify-center items-center gap-x-4 gap-y-1.5 flex-wrap mb-8 text-xs tracking-wide">
        <a href="https://video.lichuanyang.top/demo" target="_blank" rel="noopener" class="flex items-center gap-1 text-accent hover:text-ink transition-colors">🎬 Demo</a>
        <span class="text-ink/5 select-none">·</span>
        <a href="https://video.lichuanyang.top" target="_blank" rel="noopener" class="flex items-center gap-1 text-muted hover:text-ink-2 transition-colors">🏠 Home</a>
        <span class="text-ink/5 select-none">·</span>
        <a href="https://video.lichuanyang.top/guides/prompt-tips" target="_blank" rel="noopener" class="flex items-center gap-1 text-muted hover:text-ink-2 transition-colors">📖 Guides</a>
        <span class="text-ink/5 select-none">·</span>
        <a href="https://video.lichuanyang.top/faq" target="_blank" rel="noopener" class="flex items-center gap-1 text-muted hover:text-ink-2 transition-colors">❓ FAQ</a>
        <span class="text-ink/5 select-none">·</span>
        <a href="https://github.com/lcy362/agnes-video-generator" target="_blank" rel="noopener" class="flex items-center gap-1 text-muted hover:text-ink-2 transition-colors">📖 GitHub</a>
      </nav>

      <!-- Config Panel -->
      <ConfigPanel />

      <div class="mb-4 flex justify-end">
        <button class="text-sm text-muted transition hover:text-accent" @click="returnToQuickMode">← Voltar ao Modo Rápido</button>
      </div>

      <!-- Main Tabs -->
      <div class="flex gap-2 mb-6">
        <button
          class="px-5 py-2.5 rounded-lg text-sm font-medium transition"
          :class="appState.view === 'create' ? 'tab-active' : 'tab-inactive'"
          @click="switchMainTab('create')"
        >
          {{ t('tabCreate') }}
        </button>
        <button
          class="px-5 py-2.5 rounded-lg text-sm font-medium transition"
          :class="appState.view === 'gallery' ? 'tab-active' : 'tab-inactive'"
          @click="switchMainTab('gallery')"
        >
          {{ t('tabGallery') }}
        </button>
        <button
          class="px-5 py-2.5 rounded-lg text-sm font-medium transition"
          :class="appState.view === 'simple' ? 'tab-active' : 'tab-inactive'"
          @click="switchMainTab('simple')"
        >
          {{ t('tabSimple') }} <span class="tab-badge">{{ t('tabNewBadge') }}</span>
        </button>
      </div>

      <!-- Create Panel -->
      <div v-show="appState.view === 'create'">
        <CreatePanel />
      </div>

      <!-- Simple Panel -->
      <div v-show="appState.view === 'simple'">
        <SimplePanel @go-list="switchMainTab('list')" />
      </div>

      <!-- Gallery Panel (P1, 只读) -->
      <div v-show="appState.view === 'gallery'">
        <GalleryPanel />
      </div>

      <!-- Footer -->
      <footer class="text-center pb-8">
        <div class="border-t border-rule/30 pt-8 mt-4">
          <p class="text-xs text-muted mb-3">{{ t('moreResources') }}</p>
          <div class="flex justify-center flex-wrap gap-x-5 gap-y-2 text-xs">
            <a href="https://video.lichuanyang.top" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('projectHome') }}</a>
            <a href="https://video.lichuanyang.top/demo" target="_blank" rel="noopener" class="text-accent hover:text-ink transition-colors">{{ t('onlineDemo') }}</a>
            <a href="https://video.lichuanyang.top/guides/prompt-tips" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('usageGuide') }}</a>
            <a href="https://video.lichuanyang.top/faq" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('faqTitle') }}</a>
            <a href="https://video.lichuanyang.top/api-docs" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('apiDocs') }}</a>
            <a href="https://video.lichuanyang.top/learn" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('appScenarios') }}</a>
            <a href="https://video.lichuanyang.top/zh/guides/free-ai-tools" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('agentMoreTools') }}</a>
            <a href="https://github.com/lcy362/flint" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">{{ t('flintLinkLabel') }}</a>
            <a href="https://github.com/lcy362/agnes-video-generator" target="_blank" rel="noopener" class="text-muted hover:text-ink-2 transition-colors">📖 GitHub</a>
          </div>
          <!-- v7.0 U8：暴露应用版本，便于判断「模型档位未适配是否因版本过旧」 -->
          <p v-if="appState.appVersion" class="text-xs text-muted/70 mt-3">{{ t('footerVersion') }} v{{ appState.appVersion }}</p>
        </div>
      </footer>
    </div>

    <!-- Right sidebar -->
    <aside class="hidden lg:block sticky top-[120px] self-start w-[115px] shrink-0 mt-8">
      <div class="sidebar-card">
        <div class="stitle">{{ t('quickLinks') }}</div>
        <a href="https://video.lichuanyang.top/demo" target="_blank" rel="noopener">{{ t('onlineDemo') }}</a>
        <a href="https://video.lichuanyang.top/guides/prompt-tips" target="_blank" rel="noopener">{{ t('promptTips') }}</a>
        <a href="https://video.lichuanyang.top/api-docs" target="_blank" rel="noopener">{{ t('modelOverview') }}</a>
        <a href="https://video.lichuanyang.top/api-docs" target="_blank" rel="noopener">{{ t('apiCall') }}</a>
        <a href="https://video.lichuanyang.top/faq" target="_blank" rel="noopener">{{ t('faqTitle') }}</a>
        <a href="https://video.lichuanyang.top/api-docs" target="_blank" rel="noopener">{{ t('apiDocs') }}</a>
        <a href="https://video.lichuanyang.top/learn" target="_blank" rel="noopener">{{ t('appScenarios') }}</a>
      </div>
    </aside>
  </div>

  <Teleport to="body">
    <div v-if="completedVideosOpen" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6" @click.self="completedVideosOpen = false">
      <section ref="completedVideosModalRef" class="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-rule bg-paper shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="completed-videos-title">
        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-rule/60 px-5 py-4 sm:px-7">
          <div>
            <h2 id="completed-videos-title" class="text-lg font-semibold text-ink">Meus vídeos</h2>
            <p class="mt-0.5 text-xs text-muted">Vídeos concluídos</p>
          </div>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-xl text-muted transition hover:bg-paper-3 hover:text-ink" aria-label="Fechar Meus vídeos" @click="completedVideosOpen = false">×</button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <TaskListPanel scope="completed" @open-task="openTaskDetails" />
        </div>
      </section>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="taskDetailsOpen" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-5" @click.self="closeTaskDetails">
      <section ref="taskDetailsModalRef" class="h-[96dvh] max-h-[1000px] w-full max-w-6xl overflow-hidden rounded-3xl border border-rule bg-paper shadow-2xl sm:h-[92dvh]" role="dialog" aria-modal="true" aria-label="Detalhes da tarefa">
        <div class="h-full overflow-y-auto">
          <ProgressPage embedded @close="closeTaskDetails" />
        </div>
      </section>
    </div>
  </Teleport>

  <!-- Voice Picker Modal -->
  <ApiKeyModal v-model:open="apiKeyModalOpen" />
  <VoicePickerModal />

  <!-- Toast / Confirm -->
  <Toast :visible="toastVisible" :message="toastMessage" :type="toastType" />
  <ConfirmModal />
</template>

<style scoped>
.studio-shell { background: radial-gradient(ellipse at 50% -15%, rgba(139, 92, 246, .12), transparent 55%); }
</style>
