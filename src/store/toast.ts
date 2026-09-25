import { create } from 'zustand'

export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 9)
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, message?: string) => useToast.getState().push({ kind: 'success', title, message }),
  error: (title: string, message?: string) => useToast.getState().push({ kind: 'error', title, message }),
  info: (title: string, message?: string) => useToast.getState().push({ kind: 'info', title, message }),
}
