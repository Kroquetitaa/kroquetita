import { useSyncExternalStore } from 'react'
import { track } from '../net/track'

/**
 * Instalación como aplicación (PWA): registra el service worker y guarda el
 * aviso del navegador («se puede instalar») para lanzarlo desde un botón.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pending: InstallPrompt | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function setupInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    // Se guarda para ofrecerlo con nuestro botón, en vez del aviso por defecto.
    event.preventDefault()
    pending = event as InstallPrompt
    notify()
  })
  window.addEventListener('appinstalled', () => {
    pending = null
    notify()
    track('install')
  })
  // El service worker solo en la web publicada: en desarrollo estorbaría con la recarga en caliente.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}

/** ¿Ofrece el navegador instalar la web ahora mismo? */
export const useCanInstall = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pending !== null,
  )

export async function install() {
  const prompt = pending
  if (!prompt) return
  pending = null
  notify()
  await prompt.prompt()
  await prompt.userChoice.catch(() => null)
}
