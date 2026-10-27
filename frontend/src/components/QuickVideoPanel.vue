<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { appState } from '@/store'
import { useTaskSubmit } from '@/composables/useTaskSubmit'
import { useConfig } from '@/composables/useConfig'
import { useModalA11y } from '@/composables/useModalA11y'

const props = defineProps<{ modelsReady: boolean }>()
const submitter = useTaskSubmit()
const { saveModels } = useConfig()

const durations = [4, 5, 6, 8, 10, 12]
const duration = ref(8)
const aspectRatio = ref('16:9')
const taskTitle = ref('')
const prompt = ref('')
const generationMode = ref<'text' | 'image' | 'keyframes'>('image')
const startImage = ref<File | null>(null)
const endImage = ref<File | null>(null)
const startPreview = ref('')
const endPreview = ref('')
const startError = ref('')
const endError = ref('')
const dragActive = ref(false)
const startInput = ref<HTMLInputElement | null>(null)
const endInput = ref<HTMLInputElement | null>(null)
const addImagesInput = ref<HTMLInputElement | null>(null)
const promptError = ref('')
const attachmentError = ref('')
const modelSaving = ref(false)
const previewImage = ref<{ src: string; name: string; frame: string } | null>(null)
const previewOpen = computed(() => previewImage.value !== null)
const supportedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])
const { containerRef: previewModalRef } = useModalA11y(previewOpen, () => { previewImage.value = null })

watch(
  () => [props.modelsReady, appState.modelListCache.video, appState.models.video] as const,
  async ([ready, models, selected]) => {
    const preferredModel = 'agnes-video-2.5-flash'
    if (ready && !selected && models.includes(preferredModel)) {
      appState.models.video = preferredModel
      if (appState.models.text) await saveModels()
    }
  },
  { immediate: true },
)

const busy = computed(() => submitter.submitting.value)
const promptLength = computed(() => prompt.value.length)
const durationIndex = computed({
  get: () => durations.indexOf(duration.value),
  set: (index: number) => { duration.value = durations[index] ?? 8 },
})
const hasImageError = computed(() => !!(startError.value || endError.value))
const hasTwoFrames = computed(() => !!startImage.value && !!endImage.value)
const videoModels = computed(() => appState.modelListCache.video || [])
const selectedVideoModel = computed(() => appState.models.video || 'agnes-video-2.5-flash')
const aspectOptions = [
  { value: '16:9', label: '16:9', name: 'Horizontal', icon: '▰' },
  { value: '9:16', label: '9:16', name: 'Vertical', icon: '▯' },
  { value: '1:1', label: '1:1', name: 'Quadrado', icon: '□' },
]
const aspectDimensions: Record<string, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [720, 720],
}

function modelLabel(model: string): string {
  const capability = appState.videoCapabilities[model] || {}
  const label = capability.label || model
  const price = capability.price === 'paid' ? 'Pago' : model === 'agnes-video-2.5-flash' ? 'Grátis · padrão' : 'Grátis'
  return `${label} — ${price}`
}

async function onModelChange(event: Event) {
  appState.models.video = (event.target as HTMLSelectElement).value
  if (!appState.models.text) return
  modelSaving.value = true
  try {
    await saveModels()
  } finally {
    modelSaving.value = false
  }
}

watch(startImage, (next) => {
  if (startPreview.value) URL.revokeObjectURL(startPreview.value)
  startPreview.value = next ? URL.createObjectURL(next) : ''
  startError.value = ''
})
watch(endImage, (next) => {
  if (endPreview.value) URL.revokeObjectURL(endPreview.value)
  endPreview.value = next ? URL.createObjectURL(next) : ''
  endError.value = ''
})
onBeforeUnmount(() => {
  if (startPreview.value) URL.revokeObjectURL(startPreview.value)
  if (endPreview.value) URL.revokeObjectURL(endPreview.value)
})

function chooseImage(file: File | undefined, frame: 'start' | 'end') {
  if (frame === 'start') startError.value = ''
  else endError.value = ''
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!supportedExtensions.has(extension)) {
    const message = 'Formato não aceito. Use PNG, JPG, WebP, GIF ou BMP.'
    if (frame === 'start') startError.value = message
    else endError.value = message
    return
  }
  if (frame === 'start') startImage.value = file
  else endImage.value = file
}

function onFileChange(event: Event, frame: 'start' | 'end') {
  const input = event.target as HTMLInputElement
  chooseImage(input.files?.[0], frame)
  input.value = ''
}

function onAddImagesChange(event: Event) {
  const input = event.target as HTMLInputElement
  addImages(Array.from(input.files || []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  addImages(Array.from(event.dataTransfer?.files || []))
}

function addImages(files: File[]) {
  attachmentError.value = ''
  const images = files.filter((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    return supportedExtensions.has(extension)
  })
  if (images.length !== files.length) {
    attachmentError.value = 'Alguns arquivos foram ignorados. Use PNG, JPG, WebP, GIF ou BMP.'
  }
  if (!images.length) return

  if (images.length > 1) {
    generationMode.value = 'keyframes'
    startImage.value = images[0]
    endImage.value = images[1]
    if (images.length > 2) attachmentError.value = 'Use no máximo duas imagens: uma inicial e uma final.'
    return
  }

  const [image] = images
  if (generationMode.value === 'text') generationMode.value = 'image'
  if (generationMode.value === 'keyframes' && startImage.value) endImage.value = image
  else startImage.value = image
}

function selectGenerationMode(mode: 'text' | 'image' | 'keyframes') {
  generationMode.value = mode
  attachmentError.value = ''
  if (mode === 'text') {
    startImage.value = null
    endImage.value = null
  } else if (mode === 'image') {
    endImage.value = null
  }
}

function removeImage(frame: 'start' | 'end') {
  if (frame === 'start') startImage.value = null
  else endImage.value = null
}

function openImagePreview(file: File, src: string, frame: string) {
  previewImage.value = { src, name: file.name, frame }
}

async function generate() {
  promptError.value = ''
  if (!prompt.value.trim()) {
    promptError.value = 'Escreva uma descrição para o vídeo.'
    return
  }
  if (prompt.value.length > 5000) {
    promptError.value = 'O texto deve ter no máximo 5.000 caracteres.'
    return
  }
  if (hasImageError.value) return
  if (generationMode.value === 'image' && !startImage.value) {
    startError.value = 'Adicione uma imagem de referência para este modo.'
    return
  }
  if (generationMode.value === 'keyframes' && (!startImage.value || !endImage.value)) {
    if (!startImage.value) startError.value = 'Adicione a imagem inicial.'
    if (!endImage.value) endError.value = 'Adicione a imagem final.'
    return
  }

  const model = selectedVideoModel.value
  const [width, height] = aspectDimensions[aspectRatio.value]
  await submitter.runSubmit({
    taskType: 'simple',
    buildForm: () => {
      const form = new FormData()
      const title = taskTitle.value.trim()
      // Envia os aliases usados pelas versões da API; o backend persiste um só
      // valor canônico em creative_name para a listagem e as telas de progresso.
      form.append('title', title)
      form.append('task_title', title)
      form.append('creative_name', title)
      form.append('prompt', prompt.value.trim())
      form.append('mode', generationMode.value === 'keyframes' ? 'keyframes' : generationMode.value === 'image' ? 'i2v' : 't2v')
      // Os seis valores correspondem aos aceitos pela rota e enviados como seconds
      // pelo cliente Agnes Video 2.5. Preservamos o valor escolhido sem ajustes.
      form.append('duration', String(duration.value))
      form.append('video_width', String(width))
      form.append('video_height', String(height))
      form.append('video_size', '720P')
      if (generationMode.value === 'keyframes') {
        form.append('reference_image', startImage.value!)
        form.append('end_frame_image', endImage.value!)
      } else if (generationMode.value === 'image' && startImage.value) {
        form.append('reference_image', startImage.value)
      }
      return form
    },
    extraEvent: { mode: generationMode.value === 'keyframes' ? 'keyframe' : generationMode.value === 'image' ? 'reference' : 'text', duration: String(duration.value), resolution: aspectRatio.value + '/720P', video_model: model },
  })
}
</script>

<template>
  <section class="quick-composer-dock fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-8 sm:px-5">
    <div class="pointer-events-auto mx-auto max-w-4xl">
      <div
        class="studio-composer overflow-hidden rounded-[24px] border bg-paper/95 p-3 shadow-2xl shadow-violet-950/15 backdrop-blur-xl transition sm:p-4"
        :class="dragActive ? 'border-violet-500 ring-4 ring-violet-500/10' : 'border-rule/80'"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <input ref="startInput" class="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onFileChange($event, 'start')" />
        <input ref="endInput" class="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onFileChange($event, 'end')" />
        <input ref="addImagesInput" class="hidden" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onAddImagesChange" />

        <div class="mb-1 flex items-center justify-between gap-2">
          <input id="quick-task-title" v-model="taskTitle" type="text" maxlength="120" autocomplete="off" class="min-w-0 flex-1 border-0 bg-transparent px-1 py-1.5 text-sm font-medium text-ink outline-none placeholder:text-muted/70 focus:ring-0" placeholder="Título da tarefa (opcional)" aria-label="Título da tarefa, opcional" />
          <div class="flex shrink-0 items-center gap-1" role="tablist" aria-label="Modo de geração">
            <button v-for="option in [{ value: 'text', label: 'Texto' }, { value: 'image', label: 'Imagem' }, { value: 'keyframes', label: 'Início + fim' }]" :key="option.value" type="button" role="tab" :aria-selected="generationMode === option.value" class="rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:text-xs" :class="generationMode === option.value ? 'studio-mode-tab-active' : 'border-rule bg-paper text-ink-2 hover:border-violet-300 hover:bg-violet-500/5 hover:text-violet-700'" @click="selectGenerationMode(option.value as 'text' | 'image' | 'keyframes')">{{ option.label }}</button>
          </div>
        </div>

        <div class="flex items-start gap-2 sm:gap-3">
          <div v-if="startImage || endImage" class="flex shrink-0 gap-2 pt-1">
            <div v-if="startImage" class="flex w-[66px] flex-col items-center gap-1 sm:w-[76px]">
              <span v-if="generationMode === 'keyframes'" class="text-[9px] font-semibold uppercase tracking-wide text-muted">Inicial</span>
              <button type="button" class="h-[48px] w-full overflow-hidden rounded-lg border border-rule bg-paper-3 transition hover:border-violet-400" :aria-label="`Ampliar imagem inicial: ${startImage.name}`" @click="openImagePreview(startImage, startPreview, generationMode === 'keyframes' ? 'Imagem inicial' : 'Imagem de referência')">
                <img :src="startPreview" :alt="`${generationMode === 'keyframes' ? 'Imagem inicial' : 'Imagem de referência'}: ${startImage.name}`" class="h-full w-full object-cover" />
              </button>
              <div class="flex w-full justify-center gap-1">
                <button type="button" class="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-paper-3 hover:text-ink" aria-label="Trocar imagem inicial" title="Trocar imagem" @click="startInput?.click()">↻</button>
                <button type="button" class="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-red-500/10 hover:text-red-600" aria-label="Remover imagem inicial" title="Remover imagem" @click="removeImage('start')">×</button>
              </div>
            </div>
            <div v-if="endImage" class="flex w-[66px] flex-col items-center gap-1 sm:w-[76px]">
              <span class="text-[9px] font-semibold uppercase tracking-wide text-muted">Final</span>
              <button type="button" class="h-[48px] w-full overflow-hidden rounded-lg border border-rule bg-paper-3 transition hover:border-violet-400" :aria-label="`Ampliar imagem final: ${endImage.name}`" @click="openImagePreview(endImage, endPreview, 'Imagem final')">
                <img :src="endPreview" :alt="`Imagem final: ${endImage.name}`" class="h-full w-full object-cover" />
              </button>
              <div class="flex w-full justify-center gap-1">
                <button type="button" class="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-paper-3 hover:text-ink" aria-label="Trocar imagem final" title="Trocar imagem" @click="endInput?.click()">↻</button>
                <button type="button" class="rounded-md px-1.5 py-0.5 text-[10px] text-muted hover:bg-red-500/10 hover:text-red-600" aria-label="Remover imagem final" title="Remover imagem" @click="removeImage('end')">×</button>
              </div>
            </div>
          </div>

          <div class="relative min-w-0 flex-1">
            <textarea
              id="quick-prompt"
              v-model="prompt"
              maxlength="5000"
              rows="2"
              class="studio-prompt block max-h-36 min-h-[58px] w-full resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-1 py-2 pr-16 pb-6 text-sm leading-6 text-ink outline-none placeholder:text-muted/75 focus:ring-0 sm:text-base"
              placeholder="Descreva a cena, os movimentos do personagem e o comportamento da câmera..."
              aria-label="Prompt do vídeo"
              @input="promptError = ''"
            />
            <span class="pointer-events-none absolute bottom-1 right-2 text-[10px] tabular-nums text-muted/80">{{ promptLength.toLocaleString('pt-BR') }} / 5.000</span>
            <div v-if="dragActive" class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-violet-500/10 text-sm font-semibold text-violet-700">Solte a imagem para anexar</div>
          </div>
        </div>

        <p v-if="generationMode === 'keyframes' && hasTwoFrames" class="mb-2 text-[11px] font-medium text-violet-600">Transição: imagem inicial → imagem final</p>
        <p v-if="promptError || attachmentError || startError || endError" class="mb-2 text-xs text-red-600" role="alert">{{ promptError || attachmentError || startError || endError }}</p>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper text-xl text-ink-2 transition hover:border-violet-400 hover:bg-violet-500/10 hover:text-violet-600" aria-label="Adicionar imagens" title="Adicionar imagens" @click="addImagesInput?.click()">＋</button>

          <div class="flex h-10 min-w-[160px] flex-1 items-center gap-2 rounded-full border border-rule bg-paper px-2.5 sm:flex-none sm:px-3" aria-label="Duração e formato">
            <output class="w-8 shrink-0 text-center text-xs font-semibold text-ink">{{ duration }}s</output>
            <input id="quick-duration" v-model.number="durationIndex" type="range" min="0" max="5" step="1" class="studio-duration min-w-[54px] flex-1 accent-violet-600 sm:w-24 sm:flex-none" aria-label="Duração" />
            <select v-model="aspectRatio" class="max-w-[92px] border-0 bg-transparent px-1 text-xs font-semibold text-ink outline-none focus:ring-0 sm:max-w-none" aria-label="Formato">
              <option v-for="option in aspectOptions" :key="option.value" :value="option.value">{{ option.label }} {{ option.name }}</option>
            </select>
          </div>

          <select id="quick-video-model" :value="selectedVideoModel" :disabled="!modelsReady || !videoModels.length" class="h-10 min-w-[150px] flex-1 rounded-full border border-rule bg-paper px-3 text-xs font-medium text-ink outline-none transition focus:border-violet-400 disabled:opacity-60 sm:w-[175px] sm:flex-none" aria-label="Modelo de IA" @change="onModelChange">
            <option v-if="!videoModels.includes('agnes-video-2.5-flash')" value="agnes-video-2.5-flash">Video 2.5 Flash — Grátis · padrão</option>
            <option v-for="model in videoModels" :key="model" :value="model">{{ modelLabel(model) }}</option>
          </select>

          <button type="button" class="studio-generate ml-auto h-10 shrink-0 rounded-full px-4 text-xs font-semibold text-white transition disabled:cursor-wait disabled:opacity-60 sm:px-5 sm:text-sm" :disabled="busy || modelSaving" @click="generate">
            <span v-if="busy || modelSaving" class="inline-flex items-center gap-2"><span class="studio-spinner" aria-hidden="true"></span>{{ modelSaving ? 'Salvando…' : 'Gerando…' }}</span>
            <span v-else>🎬 Gerar vídeo</span>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="previewImage" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" @click.self="previewImage = null">
        <div ref="previewModalRef" class="relative w-full max-w-4xl rounded-2xl bg-paper p-3 shadow-2xl sm:p-4" role="dialog" aria-modal="true" :aria-label="`${previewImage.frame}: ${previewImage.name}`">
          <button type="button" class="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium text-white hover:bg-black/75" aria-label="Fechar imagem ampliada" @click="previewImage = null">×</button>
          <img :src="previewImage.src" :alt="`${previewImage.frame}: ${previewImage.name}`" class="mx-auto max-h-[75vh] w-full rounded-xl object-contain" />
          <p class="mt-3 truncate px-1 text-sm font-medium text-ink" :title="previewImage.name">{{ previewImage.name }}</p>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.studio-shell {
  background: radial-gradient(ellipse at 50% -15%, rgba(139, 92, 246, .12), transparent 55%);
}
.studio-card { box-shadow: 0 24px 70px rgba(30, 20, 60, .08); }
.studio-choice {
  min-height: 46px;
  border-radius: 12px;
  font-size: .875rem;
  transition: all .16s ease;
}
.studio-choice:hover { border-color: rgba(139, 92, 246, .55); }
.studio-choice-active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, .1);
  color: #7c3aed;
  box-shadow: inset 0 0 0 1px #8b5cf6;
}
.studio-mode-tab-active { border-color: #8b5cf6; background: rgba(139, 92, 246, .1); color: #7c3aed; box-shadow: inset 0 0 0 1px #8b5cf6; }
.quick-composer-dock { pointer-events: none; background: linear-gradient(to top, var(--color-paper) 62%, color-mix(in srgb, var(--color-paper) 90%, transparent) 82%, transparent); }
.studio-duration { height: 16px; cursor: pointer; }
.studio-generate { background: linear-gradient(100deg, #7c3aed, #a855f7); box-shadow: 0 10px 24px rgba(124, 58, 237, .25); }
.studio-generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(124, 58, 237, .32); }
.studio-spinner { width: 17px; height: 17px; border: 2px solid rgba(255,255,255,.45); border-top-color: white; border-radius: 50%; animation: studio-spin .75s linear infinite; }
@keyframes studio-spin { to { transform: rotate(360deg); } }
</style>
