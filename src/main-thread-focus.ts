export const MAIN_THREAD_FOCUS_EVENT = 'mira-forge:focus-main-thread'

export type MainThreadFocusDetail = {
  projectId: string
  threadId: string
}

export function focusMainThread(projectId: string, threadId: string) {
  window.dispatchEvent(new CustomEvent<MainThreadFocusDetail>(MAIN_THREAD_FOCUS_EVENT, {
    detail: { projectId, threadId },
  }))
}
