<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t, tf } from '@/i18n'
import { useConfig } from '@/composables/useConfig'
import { useModalA11y } from '@/composables/useModalA11y'

const open = defineModel<boolean>('open', { default: false })
const { apiKeyStatus, keyCount, loadKeyInfo, saveMultiKeys } = useConfig()
const apiKey = ref('')
const saving = ref(false)
const error = ref('')
const configuredHint = computed(() => {
  if (apiKeyStatus.value === 'none') return ''
  return apiKeyStatus.value === 'env'
    ? t('quickApiKeyEnvHint')
    : tf('quickApiKeyExistingHint', { count: keyCount.value })
})

function close() {
  if (saving.value) return
  error.value = ''
  open.value = false
}

const { containerRef } = useModalA11y(open, close)

watch(open, async (visible) => {
  if (!visible) return
  error.value = ''
  await loadKeyInfo()
})

async function save() {
  error.value = ''
  if (!apiKey.value.trim()) {
    error.value = t('quickApiKeyRequired')
    return
  }

  saving.value = true
  try {
    if (await saveMultiKeys(apiKey.value.trim())) {
      apiKey.value = ''
      open.value = false
    } else {
      error.value = t('quickApiKeySaveError')
    }
  } catch {
    error.value = t('quickApiKeySaveError')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center p-4" @click.self="close">
      <div class="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" aria-hidden="true"></div>
      <section
        ref="containerRef"
        class="relative z-10 w-full max-w-md rounded-2xl border border-rule bg-paper p-5 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'quick-api-key-title'"
      >
        <div class="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="quick-api-key-title" class="text-lg font-semibold text-ink">{{ t('quickApiKeyTitle') }}</h2>
            <p class="mt-1 text-sm leading-5 text-muted">{{ t('quickApiKeyHint') }}</p>
          </div>
          <button
            type="button"
            class="-mr-2 -mt-2 rounded-lg p-2 text-muted transition hover:bg-paper-3 hover:text-ink"
            :aria-label="t('quickApiKeyClose')"
            :disabled="saving"
            @click="close"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form class="space-y-4" @submit.prevent="save">
          <div>
            <label for="quick-api-key-input" class="mb-2 block text-sm font-medium text-ink-2">{{ t('apiKeyTitle') }}</label>
            <input
              id="quick-api-key-input"
              v-model="apiKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :placeholder="t('quickApiKeyPlaceholder')"
              class="w-full rounded-xl border border-rule bg-paper px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              :disabled="saving"
              autofocus
            />
            <p v-if="configuredHint" class="mt-2 text-xs leading-5 text-muted">{{ configuredHint }}</p>
            <p v-if="error" class="mt-2 text-sm text-red-600" role="alert">{{ error }}</p>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="rounded-xl border border-rule px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-paper-3" :disabled="saving" @click="close">
              {{ t('cancel') }}
            </button>
            <button type="submit" class="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60" :disabled="saving">
              {{ saving ? t('quickApiKeySaving') : t('save') }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
