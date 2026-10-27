<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { appState } from '@/store'
import { useTaskSubmit } from '@/composables/useTaskSubmit'
import { useConfig } from '@/composables/useConfig'

const emit = defineEmits<{ advanced: [] }>()
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
const dragActive = ref<'start' | 'end' | null>(null)
const startInput = ref<HTMLInputElement | null>(null)
const endInput = ref<HTMLInputElement | null>(null)
const promptError = ref('')
const modelSaving = ref(false)
const supportedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])

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

function onDrop(event: DragEvent, frame: 'start' | 'end') {
  dragActive.value = null
  chooseImage(event.dataTransfer?.files?.[0], frame)
}

function removeImage(frame: 'start' | 'end') {
  if (frame === 'start') startImage.value = null
  else endImage.value = null
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
      // task_title é o campo explícito do Modo Rápido. creative_name permanece
      // para compatibilidade com versões anteriores da API e outras telas.
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
  <section class="mx-auto max-w-3xl">
    <div class="mb-7 text-center sm:mb-9">
      <p class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Criação de vídeo com IA</p>
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Sua ideia em movimento</h1>
      <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">Descreva o que você imagina e deixe a Agnes criar o vídeo.</p>
    </div>

    <div class="studio-card space-y-7 rounded-3xl border border-rule/70 bg-paper p-4 shadow-xl shadow-violet-950/5 sm:space-y-8 sm:p-8">
      <section>
        <h2 class="mb-3 text-sm font-semibold text-ink">Como deseja criar?</h2>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Modo de geração">
          <button v-for="option in [{ value: 'text', label: 'Texto para vídeo' }, { value: 'image', label: 'Imagem para vídeo' }, { value: 'keyframes', label: 'Primeiro e último frame' }]" :key="option.value" type="button" role="tab" :aria-selected="generationMode === option.value" class="studio-mode-tab rounded-xl border px-3 py-3 text-sm font-medium transition" :class="generationMode === option.value ? 'studio-mode-tab-active' : 'border-rule text-ink-2 hover:border-violet-400'" @click="generationMode = option.value as 'text' | 'image' | 'keyframes'">{{ option.label }}</button>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-2 sm:items-start">
        <section>
          <label for="quick-task-title" class="mb-2 block text-sm font-semibold text-ink">Título da tarefa <span class="font-normal text-muted">(opcional)</span></label>
          <input
            id="quick-task-title"
            v-model="taskTitle"
            type="text"
            maxlength="120"
            autocomplete="off"
            class="w-full rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
            placeholder="Ex.: Um passeio ao entardecer"
          />
        </section>
        <section>
          <label for="quick-video-model" class="mb-2 block text-sm font-semibold text-ink">Modelo de vídeo</label>
          <select id="quick-video-model" :value="selectedVideoModel" :disabled="!modelsReady || !videoModels.length" class="w-full rounded-xl border border-rule bg-paper px-3.5 py-3 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 disabled:opacity-60" @change="onModelChange">
            <option v-if="!videoModels.includes('agnes-video-2.5-flash')" value="agnes-video-2.5-flash">Video 2.5 Flash — Grátis · padrão</option>
            <option v-for="model in videoModels" :key="model" :value="model">{{ modelLabel(model) }}</option>
          </select>
          <p v-if="appState.videoCapabilities[selectedVideoModel]?.price === 'paid'" class="mt-2 text-xs leading-5 text-amber-700">Este modelo é pago: 720P US$ 0,025/s, 960P US$ 0,04/s e 2K US$ 0,055/s. As cinco primeiras imagens de referência não têm custo.</p>
          <p v-else-if="selectedVideoModel === 'agnes-video-2.5-flash'" class="mt-2 text-xs text-muted">Modelo grátis (por tempo limitado), com resolução padrão 720P.</p>
        </section>
      </div>

      <section v-if="generationMode !== 'text'">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-ink">{{ generationMode === 'image' ? 'Imagem de referência' : 'Quadros do vídeo' }} <span v-if="generationMode === 'keyframes'" class="font-normal text-muted">(inicial e final)</span></h2>
          <span v-if="generationMode === 'keyframes'" class="text-right text-xs text-muted">Definem o início e o fim da composição</span>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label v-if="generationMode === 'keyframes'" class="mb-2 block text-sm font-medium text-ink">Imagem inicial</label>
            <div
              class="studio-upload relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition sm:min-h-56"
              :class="dragActive === 'start' ? 'border-violet-500 bg-violet-500/10' : 'border-rule hover:border-violet-400'"
              @click="!startImage && startInput?.click()"
              @dragover.prevent="dragActive = 'start'"
              @dragleave.prevent="dragActive = null"
              @drop.prevent="onDrop($event, 'start')"
            >
              <input ref="startInput" class="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onFileChange($event, 'start')" />
              <template v-if="startImage">
                <img :src="startPreview" :alt="(generationMode === 'image' ? 'Prévia da imagem de referência ' : 'Prévia da imagem inicial ') + startImage.name" class="absolute inset-0 h-full w-full object-contain" />
                <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/65 px-3 py-3 text-white backdrop-blur-sm">
                  <span class="min-w-0 truncate text-xs">{{ startImage.name }}</span>
                  <span class="flex shrink-0 gap-1.5">
                    <button class="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/25" @click.stop="startInput?.click()">Trocar</button>
                    <button class="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/25" @click.stop="removeImage('start')">Remover</button>
                  </span>
                </div>
              </template>
              <div v-else class="px-4 py-7 text-center">
                <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl text-violet-500">＋</div>
                <p class="text-sm font-medium text-ink">{{ generationMode === 'image' ? 'Escolha ou arraste sua imagem' : 'Escolha ou arraste a imagem inicial' }}</p>
                <p class="mt-1.5 text-xs text-muted">PNG, JPG, WebP, GIF ou BMP</p>
              </div>
            </div>
            <p v-if="startError" class="mt-2 text-sm text-red-500" role="alert">{{ startError }}</p>
          </div>

          <div v-if="generationMode === 'keyframes'">
            <label class="mb-2 block text-sm font-medium text-ink">Imagem final <span class="font-normal text-muted">(opcional)</span></label>
            <div
              class="studio-upload relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition sm:min-h-56"
              :class="dragActive === 'end' ? 'border-violet-500 bg-violet-500/10' : 'border-rule hover:border-violet-400'"
              @click="!endImage && endInput?.click()"
              @dragover.prevent="dragActive = 'end'"
              @dragleave.prevent="dragActive = null"
              @drop.prevent="onDrop($event, 'end')"
            >
              <input ref="endInput" class="hidden" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp" @change="onFileChange($event, 'end')" />
              <template v-if="endImage">
                <img :src="endPreview" :alt="'Prévia da imagem final ' + endImage.name" class="absolute inset-0 h-full w-full object-contain" />
                <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/65 px-3 py-3 text-white backdrop-blur-sm">
                  <span class="min-w-0 truncate text-xs">{{ endImage.name }}</span>
                  <span class="flex shrink-0 gap-1.5">
                    <button class="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/25" @click.stop="endInput?.click()">Trocar</button>
                    <button class="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs hover:bg-white/25" @click.stop="removeImage('end')">Remover</button>
                  </span>
                </div>
              </template>
              <div v-else class="px-4 py-7 text-center">
                <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl text-violet-500">＋</div>
                <p class="text-sm font-medium text-ink">Adicione um quadro final</p>
                <p class="mt-1.5 text-xs text-muted">Opcional · PNG, JPG, WebP, GIF ou BMP</p>
              </div>
            </div>
            <p v-if="endError" class="mt-2 text-sm text-red-500" role="alert">{{ endError }}</p>
          </div>
        </div>
        <p v-if="generationMode === 'keyframes' && hasTwoFrames" class="mt-3 text-center text-xs font-medium text-violet-500">Transição: imagem inicial → imagem final</p>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between gap-3">
          <label for="quick-prompt" class="text-sm font-semibold text-ink">O que acontece no vídeo?</label>
          <span class="text-xs text-muted">{{ promptLength.toLocaleString('pt-BR') }} / 5.000</span>
        </div>
        <textarea
          id="quick-prompt"
          v-model="prompt"
          maxlength="5000"
          rows="5"
          class="studio-prompt w-full resize-y rounded-2xl border border-rule bg-paper px-4 py-4 text-sm leading-6 text-ink outline-none transition placeholder:text-muted/70 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 sm:px-5"
          placeholder="Descreva a cena, os movimentos do personagem e o comportamento da câmera..."
          @input="promptError = ''"
        />
        <p v-if="promptError" class="mt-2 text-sm text-red-500" role="alert">{{ promptError }}</p>
      </section>

      <div class="grid gap-7 sm:grid-cols-2 sm:gap-8">
        <section>
          <h2 class="mb-3 text-sm font-semibold text-ink">Duração</h2>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="seconds in durations" :key="seconds" type="button" class="studio-choice border border-rule text-ink-2" :class="duration === seconds ? 'studio-choice-active' : ''" :aria-pressed="duration === seconds" @click="duration = seconds">
              {{ seconds }} <span class="text-xs font-normal">seg</span>
            </button>
          </div>
        </section>
        <section>
          <h2 class="mb-3 text-sm font-semibold text-ink">Formato</h2>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="option in aspectOptions" :key="option.value" type="button" class="studio-choice flex flex-col items-center gap-1.5 border border-rule py-2.5 text-ink-2" :class="aspectRatio === option.value ? 'studio-choice-active' : ''" :aria-pressed="aspectRatio === option.value" @click="aspectRatio = option.value">
              <span class="text-lg leading-5">{{ option.icon }}</span>
              <span class="text-xs font-semibold">{{ option.label }}</span>
              <span class="text-[10px] font-normal opacity-75">{{ option.name }}</span>
            </button>
          </div>
        </section>
      </div>

      <div class="border-t border-rule/70 pt-6">
        <button type="button" class="studio-generate w-full rounded-2xl px-5 py-4 text-base font-semibold text-white transition disabled:cursor-wait disabled:opacity-60" :disabled="busy || modelSaving" @click="generate">
          <span v-if="busy || modelSaving" class="inline-flex items-center justify-center gap-2"><span class="studio-spinner" aria-hidden="true"></span>{{ modelSaving ? 'Salvando modelo...' : ' Enviando seu vídeo...' }}</span>
          <span v-else>🎬 Gerar vídeo</span>
        </button>
        <p class="mt-3 text-center text-xs text-muted">O resultado e o progresso da geração serão abertos em uma nova página.</p>
      </div>
    </div>

    <div class="mt-5 text-center">
      <button class="text-sm text-muted transition hover:text-violet-500" @click="emit('advanced')">Precisa de mais opções? <span class="font-medium">Acesse o Modo Avançado →</span></button>
    </div>
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
.studio-generate { background: linear-gradient(100deg, #7c3aed, #a855f7); box-shadow: 0 10px 24px rgba(124, 58, 237, .25); }
.studio-generate:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(124, 58, 237, .32); }
.studio-spinner { width: 17px; height: 17px; border: 2px solid rgba(255,255,255,.45); border-top-color: white; border-radius: 50%; animation: studio-spin .75s linear infinite; }
@keyframes studio-spin { to { transform: rotate(360deg); } }
</style>
