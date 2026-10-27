<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { t } from '@/i18n'
import { useArtifacts } from '@/composables/useArtifacts'
import { copyText } from '@/utils/clipboard'
import type { Artifact } from '@/types'

const props = defineProps<{ art: Artifact; large?: boolean }>()

const {
  isRunning,
  artifactLabel,
  artifactIcon,
  artifactFileUrl,
  formatSize,
  toggleArtifactPreview,
  openImageModal,
  confirmDeleteArtifact,
} = useArtifacts()

const previewExpanded = ref(false)
const previewText = ref('')
const previewLoading = ref(false)

// 文本 / JSON / 字幕类产物：默认自动展开预览
async function loadPreview() {
  previewExpanded.value = true
  previewLoading.value = true
  previewText.value = ''
  try {
    const resp = await fetch(artifactFileUrl(props.art))
    let text = await resp.text()
    if (text.length > 2000) text = text.substring(0, 2000) + '\n...'
    previewText.value = text
  } catch (err: any) {
    previewText.value = 'Error: ' + err.message
  } finally {
    previewLoading.value = false
  }
}

async function onPreviewClick(e: Event) {
  const el = e.currentTarget as HTMLElement
  if (previewExpanded.value) {
    previewExpanded.value = false
    previewText.value = ''
  } else {
    await loadPreview()
  }
  void el
}

onMounted(() => {
  const cat = props.art.category
  if (cat !== 'image' && cat !== 'video' && cat !== 'audio') {
    loadPreview()
  }
})

async function onCopyPath() {
  const p = (props.art as any).abs_path || (props.art as any).path || ''
  if (!p) return
  await copyText(p)
}
</script>

<template>
  <div class="artifact-card flex items-start gap-3 rounded-2xl border border-rule/60 bg-paper-2/20 p-3 sm:p-4">
    <span class="text-lg mt-0.5 shrink-0">{{ artifactIcon(art) }}</span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs text-ink-2 truncate">{{ artifactLabel(art) }}</span>
        <span class="text-xs text-muted shrink-0">{{ formatSize(art.size) }}</span>
      </div>

      <!-- 图片预览 -->
      <img
        v-if="art.category === 'image'"
        :src="artifactFileUrl(art)"
        class="cursor-pointer rounded-xl border border-rule/50"
        :class="large ? 'w-full max-h-[400px]' : 'max-h-36'"
        loading="lazy"
        @click="openImageModal(artifactFileUrl(art))"
      />
      <!-- 视频预览 -->
      <video
        v-else-if="art.category === 'video'"
        :src="artifactFileUrl(art)"
        controls
        playsinline
        preload="metadata"
        class="w-full rounded-xl border border-rule/50 bg-black"
        :style="large ? 'max-height: 460px' : 'max-height: 260px'"
      ></video>
      <!-- 音频预览 -->
      <audio v-else-if="art.category === 'audio'" :src="artifactFileUrl(art)" controls class="w-full" preload="metadata"></audio>
      <!-- 文本 / JSON 预览 -->
      <pre
        v-else
        class="cursor-pointer overflow-auto whitespace-pre-wrap rounded-xl border border-rule/40 bg-paper p-3 text-xs text-muted"
        :class="large ? 'max-h-64' : 'max-h-24'"
        @click="onPreviewClick"
      >{{ previewExpanded ? (previewLoading ? t('loading') + '...' : previewText) : t('clickToPreview') }}</pre>

      <!-- 路径复制 -->
      <div
        v-if="(art as any).abs_path || (art as any).path"
        class="mt-1.5 text-[10px] text-muted font-mono truncate cursor-pointer hover:text-ink-2 transition"
        :title="t('copy')"
        @click="onCopyPath"
      >{{ (art as any).abs_path || (art as any).path }}</div>
    </div>

    <!-- 删除 -->
    <button
      v-if="art.deletable && !isRunning"
      class="shrink-0 rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-600 transition hover:bg-red-500/10"
      :title="t('delete')"
      @click="confirmDeleteArtifact(art)"
    >
      ✕
    </button>
  </div>
</template>
