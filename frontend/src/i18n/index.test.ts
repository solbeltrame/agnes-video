import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage, currentLang, LANGS } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('supported UI languages', () => {
  it('offers only Brazilian Portuguese and US English', () => {
    expect(LANGS).toEqual([
      { code: 'pt', label: '🇧🇷 Português (Brasil)' },
      { code: 'en', label: '🇺🇸 English (US)' },
    ])
  })

  it('maps unsupported saved language codes to Brazilian Portuguese', () => {
    const root = { lang: '', dir: '' }
    const setItem = vi.fn()
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('localStorage', { setItem })

    applyLanguage('ja')

    expect(currentLang.value).toBe('pt')
    expect(setItem).toHaveBeenCalledWith('lang', 'pt')
    expect(root).toEqual({ lang: 'pt-BR', dir: 'ltr' })
  })
})
