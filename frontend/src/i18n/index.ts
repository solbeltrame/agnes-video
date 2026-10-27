import { ref, reactive, computed } from 'vue'
// Portuguese and English are the only selectable application languages.
import pt from './langs/pt.json'
import en from './langs/en.json'

// UI languages; codes stay aligned with the existing translation files and API headers.
export const LANGS: { code: string; label: string }[] = [
  { code: 'pt', label: '🇧🇷 Português (Brasil)' },
  { code: 'en', label: '🇺🇸 English (US)' },
]

const supportedLangCodes = new Set(LANGS.map((lang) => lang.code))

// Both supported language bundles are ready immediately; other locale files are not loaded.
const langData = reactive<Record<string, Record<string, string>>>({ pt, en })

const currentLang = ref('pt')

function initLang(): string {
  try {
    const saved = localStorage.getItem('lang') || ''
    return supportedLangCodes.has(saved) ? saved : 'pt'
  } catch {
    return 'pt'
  }
}

export function t(key: string): string {
  const lang = currentLang.value
  const data = langData[lang]
  const val = (data && data[key]) ?? langData.pt[key] ?? key
  return val
}

// v7.0 U1：带插值参数的翻译（后端下发的 i18n key + params 用此渲染）。
// 占位符为 {name} 形式；同时支持 {count} 这类命名参数。
export function tf(key: string, params?: Record<string, string | number>): string {
  const template = t(key)
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name]
    return v === undefined || v === null ? m : String(v)
  })
}

export function applyLanguage(lang: string) {
  currentLang.value = supportedLangCodes.has(lang) ? lang : 'pt'
  try {
    localStorage.setItem('lang', currentLang.value)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = currentLang.value === 'pt' ? 'pt-BR' : 'en-US'
  document.documentElement.dir = 'ltr'
}

const loadingLang = ref<string | null>(null)

async function loadLang(lang: string): Promise<void> {
  // Keep the public helper for compatibility; supported bundles are statically imported.
  if (!supportedLangCodes.has(lang)) return
}

// 转义动态文本，防止 innerHTML 注入（XSS 防护）
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function useI18n() {
  const lang = computed(() => currentLang.value)

  function switchLang(l: string) {
    applyLanguage(l)
    void loadLang(l)
  }

  // 判断某值是否属于某 i18n key 的默认值集合（用于语言切换时刷新默认值）
  function isDefaultValue(value: string, i18nKey: string): boolean {
    const allDefaults = new Set(Object.values(langData).map((l) => l[i18nKey]).filter(Boolean))
    return allDefaults.has(value) || value === ''
  }

  return { lang, currentLang, t, tf, switchLang, isDefaultValue, applyLanguage, loadingLang, loadLang }
}

// 初始化语言（模块加载后立即同步）
currentLang.value = initLang()
// Normalize legacy saved locales (for example zh or ja) to Portuguese on startup.

export { currentLang }
