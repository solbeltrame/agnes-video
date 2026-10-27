import { appState } from '@/store'

// 顶层视图导航 + URL hash 同步（无 vue-router，零后端改动）
// hash 规则：'#/progress/<taskId>' | '#/list' | '#/gallery' | '#/create'

export function useNavigation() {
  // 所有任务详情统一交给根组件在当前页面以模态框打开。
  function goProgress(taskId: string, origin: 'create' | 'list' | 'gallery' = 'create') {
    appState.progressOrigin = origin
    window.dispatchEvent(new CustomEvent('agnes:open-task-progress', { detail: { taskId, origin } }))
  }

  // 兼容旧调用名；任务详情始终以模态框打开。
  function goProgressInPage(taskId: string) {
    goProgress(taskId, appState.progressOrigin)
  }

  // 显式跳转主页（去掉 hash 回到根视图）
  function goHome() {
    location.href = location.pathname + location.search
  }

  function goBack() {
    const origin = appState.progressOrigin === 'list' ? 'list' : 'create'
    appState.view = origin
    appState.progressTaskId = null
    location.hash = origin === 'list' ? '#/list' : '#/create'
  }

  function parseHash(): { view: 'create' | 'list' | 'gallery' | 'progress'; taskId?: string } {
    const h = location.hash || ''
    const m = h.match(/^#\/progress\/(.+)$/)
    if (m) return { view: 'progress', taskId: decodeURIComponent(m[1]) }
    if (h.startsWith('#/list')) return { view: 'list' }
    if (h.startsWith('#/gallery')) return { view: 'gallery' }
    return { view: 'create' }
  }

  return { goProgress, goProgressInPage, goHome, goBack, parseHash }
}
