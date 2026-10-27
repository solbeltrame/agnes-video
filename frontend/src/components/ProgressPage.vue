<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { t } from '@/i18n'
import { appState } from '@/store'
import { useProgress } from '@/composables/useProgress'
import { useArtifacts } from '@/composables/useArtifacts'
import { useNavigation } from '@/composables/useNavigation'
import ProgressHeader from './ProgressHeader.vue'
import StepTimeline from './StepTimeline.vue'
import ArtifactCard from './ArtifactCard.vue'
import CheckpointDetail from './CheckpointDetail.vue'
import FeedbackPanel from './FeedbackPanel.vue'
import { isDeterministicError, isLocalNetworkError } from '@/utils/feedback'

const {
  progressPct,
  progressMessage,
  resultVideoVisible,
  resultVideoSrc,
  steps,
  stepStates,
  taskFailed,
  failedMessage,
  retryWindowHint,
  liveFailedStep,
  awaitingCheckpoint,
  retryCount,
  retrying,
  connectionLost,
  needsResume,
  retryFailedTask,
  mountProgressPage,
  unmountProgressPage,
} = useProgress()

const {
  artifactsAreaVisible,
  artifactGroups,
  imageModalUrl,
  stepLabelMap,
  closeImageModal,
} = useArtifacts()

const { goBack } = useNavigation()

// 产物流按执行顺序排列（steps 顺序优先，未知 step 保持后端相对顺序）
const orderedGroups = computed(() => {
  const order = steps.value.map((s) => s.key)
  const map: Record<string, (typeof artifactGroups.value)[0]> = {}
  artifactGroups.value.forEach((g) => {
    if (!map[g.stepKey]) map[g.stepKey] = g
  })
  const keys = Object.keys(map)
  keys.sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return keys.map((k) => map[k])
})

// 折叠状态：默认只展开「最近一个环节」的产物，之前的历史环节自动折叠
// （暂停点时主体聚焦当前检查点产物；自动模式时主体聚焦最近生成环节）
const collapsed = ref<Record<string, boolean>>({})
function toggleCollapse(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

// 当前聚焦分组 = 最新产物分组（暂停点高亮 + 大图展示；自动模式为主体的最近环节）
const focusGroup = computed(() => {
  const groups = orderedGroups.value
  return groups.length ? groups[groups.length - 1].stepKey : null
})

function isCollapsed(key: string): boolean {
  if (key in collapsed.value) return collapsed.value[key]
  // 仅展开最近一个环节，之前的全部自动折叠（页面主体留给当前环节/暂停点产物）
  return key !== focusGroup.value
}

// 当前暂停点产物分组（用于高亮 + 大图展示）
const checkpointGroup = computed(() => {
  if (!awaitingCheckpoint.value) return null
  return focusGroup.value
})

// 步骤定位：点击时间线滚动到对应产物分组
function scrollToStep(stepKey: string) {
  const el = document.getElementById('artifact-group-' + stepKey)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ── v6.1 问题反馈：失败任务重试（断点续传自愈偶发故障）──
async function onRetryTask() {
  const taskId = appState.progressTaskId
  if (taskId) await retryFailedTask(taskId)
}

// ── 任务信息展示（优化 v6.1：展示用户输入提示词与各项配置）──
const taskInfo = ref<any>(null)
const taskInfoOpen = ref(true)

// 各任务类型：输入提示词字段 → i18n label
const INPUT_FIELDS: Record<string, { field: string; label: string }[]> = {
  creative: [{ field: 'idea', label: 'tiIdea' }],
  manuscript: [{ field: 'manuscript_text', label: 'tiManuscript' }],
  anchor: [
    { field: 'script_text', label: 'tiScript' },
    { field: 'anchor_prompt', label: 'tiAnchorPrompt' },
  ],
  poetry: [{ field: 'poem_text', label: 'tiPoem' }],
  simple: [{ field: 'prompt', label: 'tiPrompt' }],
}

// 各任务类型：关键配置展示（字段 → i18n label）
const CONFIG_FIELDS: Record<string, { field: string; label: string; fmt?: (v: any) => string }[]> = {
  creative: [
    { field: 'video_width', label: 'tiWidth', fmt: (v) => String(v ?? '') },
    { field: 'video_height', label: 'tiHeight', fmt: (v) => String(v ?? '') },
    { field: 'scene_count', label: 'tiScenes', fmt: (v) => String(v ?? '') },
    { field: 'chaining_mode', label: 'tiChaining' },
    { field: 'style', label: 'tiStyle' },
  ],
  manuscript: [
    { field: 'scene_count', label: 'tiScenes', fmt: (v) => String(v ?? '') },
    { field: 'paragraph_count', label: 'tiParagraphs', fmt: (v) => String(v ?? '') },
  ],
  anchor: [
    { field: 'audio_source', label: 'tiAudioSource' },
    { field: 'video_width', label: 'tiWidth', fmt: (v) => String(v ?? '') },
    { field: 'video_height', label: 'tiHeight', fmt: (v) => String(v ?? '') },
  ],
  poetry: [
    { field: 'video_width', label: 'tiWidth', fmt: (v) => String(v ?? '') },
    { field: 'video_height', label: 'tiHeight', fmt: (v) => String(v ?? '') },
    { field: 'scene_count', label: 'tiScenes', fmt: (v) => String(v ?? '') },
    { field: 'style', label: 'tiStyle' },
  ],
  simple: [
    { field: 'mode', label: 'tiMode' },
    { field: 'duration', label: 'tiDuration', fmt: (v) => String(v ?? '') },
  ],
}

const taskInputs = computed(() => INPUT_FIELDS[appState.currentTaskType] || [])
const taskConfigs = computed(() => CONFIG_FIELDS[appState.currentTaskType] || [])

// v6.1 问题反馈：诊断报告用的关键配置字符串列表（复用 taskConfigs 展示逻辑）
const feedbackConfigs = computed(() =>
  taskConfigs.value
    .map((c) => {
      const v = c.fmt ? c.fmt(taskInfo.value?.[c.field]) : taskInfo.value?.[c.field]
      return v ? `${t(c.label)}: ${v}` : null
    })
    .filter((s): s is string => !!s),
)

// v6.1 问题反馈：错误是否为确定性故障（命中则切换引导文案 + 弱化重试按钮）
// v6.4.8：本机网络/域名解析故障单列一类，引导是「查 DNS/代理」，不套参数类文案
const networkError = computed(() => isLocalNetworkError(failedMessage.value))
const deterministicError = computed(
  () => !networkError.value && isDeterministicError(failedMessage.value),
)
// 两类「重试大概率无效」的故障：统一弱化重试按钮
const retryIneffective = computed(() => networkError.value || deterministicError.value)

// 诊断报告的失败环节：优先后端实时环节名，回退页面挂载时的快照（issue #56/#57）
const reportFailedStep = computed(
  () => liveFailedStep.value || taskInfo.value?.current_step || '',
)

onMounted(async () => {
  const taskId = appState.progressTaskId
  if (!taskId) return
  taskInfo.value = await mountProgressPage(taskId, appState.currentDirName)
})

onUnmounted(() => {
  unmountProgressPage()
})
</script>

<template>
  <div class="progress-page min-h-screen bg-paper">
    <ProgressHeader />

    <div class="mx-auto max-w-5xl px-4 py-6 sm:py-8 lg:flex lg:gap-6">
      <!-- Linha do tempo do processo -->
      <aside class="hidden w-[220px] shrink-0 lg:block">
        <div class="sticky top-24 rounded-3xl border border-rule/70 bg-paper p-3 shadow-sm">
          <StepTimeline @locate="scrollToStep" />
        </div>
      </aside>

      <!-- 主工作台 -->
      <main class="flex-1 min-w-0">
        <div class="mb-5">
          <p class="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Agnes Studio</p>
          <h1 class="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Acompanhamento da geração</h1>
          <p class="mt-2 text-sm text-muted">Veja o progresso e os arquivos criados em cada etapa.</p>
        </div>

        <!-- 移动端环节胶囊条 -->
        <div class="mb-4 rounded-2xl border border-rule/70 bg-paper p-3 shadow-sm lg:hidden">
          <StepTimeline horizontal @locate="scrollToStep" />
        </div>

        <!-- 状态区 -->
        <div class="mb-4 rounded-3xl border border-rule/70 bg-paper p-5 shadow-lg shadow-violet-950/5 sm:p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-muted">{{ t('progress') }}</span>
            <span class="text-sm font-semibold text-violet-600">{{ progressPct }}%</span>
          </div>
          <div class="w-full bg-paper-2/50 rounded-full h-2.5 overflow-hidden">
            <div class="h-2.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-500" :style="{ width: progressPct + '%' }"></div>
          </div>

          <!-- 失败信息 -->
          <div v-if="taskFailed" class="mt-5 space-y-2 rounded-2xl border border-red-500/25 bg-red-500/5 p-4 sm:p-5">
            <p class="font-semibold text-red-600">{{ t('genFailed') }}</p>
            <p class="text-muted text-xs">{{ failedMessage || t('genFailedMsg') }}</p>
            <!-- v7.3：队列满/上游 503 时的错峰重试建议（按浏览者所在时区换算，不同时区看到各自本地时间） -->
            <p v-if="retryWindowHint" class="text-xs text-accent leading-relaxed">{{ retryWindowHint }}</p>
            <!-- v6.1 问题反馈：重试引导（偶发故障优先断点续传自愈，多次失败再上报） -->
            <div class="space-y-2 border-t border-red-500/15 pt-3">
              <!-- 引导文案：网络/域名类 → 自查环境；确定性故障 → 建议直接反馈；其余 → 断点续传自愈 -->
              <p class="text-xs leading-relaxed" :class="retryIneffective ? 'text-amber-400' : 'text-muted'">
                {{ networkError ? t('fbNetworkHint') : deterministicError ? t('fbDeterministicHint') : t('fbRetryHint') }}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <button
                  :disabled="retrying"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-lg disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
                  @click="onRetryTask"
                >
                  <span v-if="retrying" class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true"></span>
                  <span v-else aria-hidden="true">↻</span>
                  {{ retrying ? t('resuming') : t('fbRetryBtn') }}
                </button>
                <span v-if="retryCount > 0" class="text-xs text-muted">{{ t('fbRetriedN').replace('{n}', String(retryCount)) }}</span>
              </div>
              <!-- v6.1 问题反馈：反馈区（渐进展开 + 复制 + FAQ + GitHub Issue） -->
              <FeedbackPanel
                v-if="appState.progressTaskId"
                :task-id="appState.progressTaskId"
                :task-type="appState.currentTaskType || 'creative'"
                :mode="taskInfo?.mode"
                :failed-step="reportFailedStep"
                :error-message="failedMessage || ''"
                :retry-count="retryCount"
                :configs="feedbackConfigs"
                @retry="onRetryTask"
              />
            </div>
          </div>
          <div v-else-if="needsResume" class="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p class="text-sm font-semibold text-amber-800">{{ t('taskNotRunning') }}</p>
              <p class="mt-1 text-xs leading-relaxed text-muted">{{ t('taskNotRunningHint') }}</p>
            </div>
            <button :disabled="retrying" class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60" @click="onRetryTask">
              <span v-if="retrying" class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true"></span>
              <span v-else aria-hidden="true">↻</span>
              {{ retrying ? t('resuming') : t('fbRetryBtn') }}
            </button>
          </div>
          <!-- 进度消息（HTML 渲染，来自后端安全文案） -->
          <div v-else-if="!needsResume" class="mt-4 text-sm text-muted" v-html="progressMessage"></div>

          <!-- 1.7：连接异常横幅（连续轮询失败 N 次后展示） -->
          <div v-if="connectionLost" class="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-600">
            {{ t('connLost') }}
          </div>
        </div>

        <!-- 任务信息（用户输入提示词 + 各项配置，v6.1） -->
        <div v-if="taskInfo" class="mb-4 overflow-hidden rounded-3xl border border-rule/70 bg-paper shadow-sm">
          <button class="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-violet-500/5 sm:px-5" @click="taskInfoOpen = !taskInfoOpen">
            <span class="text-sm transition-transform" :class="taskInfoOpen ? 'rotate-90' : ''">▸</span>
            <span class="text-sm font-medium text-ink-2">{{ t('taskInfo') }}</span>
            <span class="ml-auto text-xs text-muted">{{ taskInfoOpen ? t('ppCollapse') : t('ppExpand') }}</span>
          </button>

          <div v-show="taskInfoOpen" class="space-y-3 px-4 pb-5 sm:px-5">
            <!-- 输入提示词 -->
            <div v-for="f in taskInputs" :key="f.field" class="space-y-1">
              <div class="text-xs text-muted">{{ t(f.label) }}</div>
              <p class="rounded-xl border border-rule/50 bg-paper-2/30 px-3 py-3 text-sm leading-relaxed text-ink-2 whitespace-pre-wrap break-words">
                {{ taskInfo[f.field] || '—' }}
              </p>
            </div>

            <!-- 关键配置 -->
            <div v-if="taskConfigs.length" class="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <div v-for="c in taskConfigs" :key="c.field" class="flex items-center gap-1.5 text-xs">
                <span class="text-muted">{{ t(c.label) }}:</span>
                <span class="text-ink-2 font-mono">{{ c.fmt ? c.fmt(taskInfo[c.field]) : (taskInfo[c.field] || '—') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 产物流：逐步追加（按环节分组，已完成折叠） -->
        <div v-if="artifactsAreaVisible" class="space-y-3">
          <div
            v-for="g in orderedGroups"
            :id="'artifact-group-' + g.stepKey"
            :key="g.stepKey"
            class="artifact-group mb-3 overflow-hidden rounded-3xl border border-rule/70 bg-paper shadow-sm"
            :class="g.stepKey === checkpointGroup ? 'border-amber-500/40 ring-1 ring-amber-500/20' : ''"
          >
            <button
              class="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-violet-500/5 sm:px-5"
              :class="g.stepKey === checkpointGroup ? 'bg-amber-500/5' : ''"
              @click="toggleCollapse(g.stepKey)"
            >
              <span class="text-sm transition-transform" :class="isCollapsed(g.stepKey) ? '' : 'rotate-90'">▸</span>
              <span class="text-sm font-medium" :class="g.stepKey === checkpointGroup ? 'text-amber-400' : 'text-ink-2'">{{ t(stepLabelMap[g.stepKey] || g.stepKey) }}</span>
              <span v-if="g.stepKey === checkpointGroup" class="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 shrink-0">⏸ {{ t('awaitingUser') }}</span>
              <span class="text-xs text-muted">{{ g.items.length }} 项</span>
              <span class="ml-auto text-xs text-muted">{{ isCollapsed(g.stepKey) ? t('ppExpand') : t('ppCollapse') }}</span>
            </button>

            <div v-show="!isCollapsed(g.stepKey)" class="space-y-2 px-4 pb-5 sm:px-5">
              <ArtifactCard v-for="art in g.items" :key="art.artifact_id" :art="art" :large="g.stepKey === checkpointGroup" />
            </div>
          </div>
        </div>

        <!-- 暂停审查区：紧跟最新产物（就近操作） -->
        <CheckpointDetail
          v-if="awaitingCheckpoint && appState.currentTaskId"
          :task-id="appState.currentTaskId"
          :checkpoint="awaitingCheckpoint"
        />

        <!-- 结果视频 -->
        <div v-if="resultVideoVisible" class="mt-4 rounded-3xl border border-emerald-500/20 bg-paper p-4 shadow-lg shadow-violet-950/5 sm:p-6">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">✓</span>
              <p class="text-sm font-semibold text-ink">{{ t('videoComplete') }}</p>
            </div>
            <a :href="resultVideoSrc" :download="'agnes-video-' + appState.progressTaskId + '.mp4'" class="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700">↓ Baixar vídeo</a>
          </div>
          <video :src="resultVideoSrc" controls playsinline class="max-h-[70vh] w-full rounded-2xl bg-black shadow-md"></video>
        </div>

        <!-- 官网导流资源（更多资源链接，与主页一致） -->
      </main>
    </div>

    <!-- 图片放大弹窗 -->
    <div v-if="imageModalUrl" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer" @click="closeImageModal">
      <img :src="imageModalUrl" class="max-w-[90vw] max-h-[90vh] rounded-lg" />
    </div>
  </div>
</template>
