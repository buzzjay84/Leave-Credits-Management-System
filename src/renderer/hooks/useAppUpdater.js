import { useEffect, useRef, useState } from 'react'

// Mounted once at the top of the app (App.jsx), not inside Topbar, so the
// update listeners are live from launch — including the splash/login screens
// where the startup check and any silent Windows auto-download would
// otherwise run with nothing subscribed to show it.
export function useAppUpdater() {
  const [status, setStatus] = useState({ state: 'idle', message: 'Check for updates' })
  const [showModal, setShowModal] = useState(false)
  const hasAutoShownDownload = useRef(false)

  useEffect(() => {
    const updater = window.electronAPI
    if (!updater?.getUpdateStatus) return
    updater.getUpdateStatus().then(current => current && setStatus(current))
    updater.onUpdateStatus?.(next => {
      setStatus(next)
      // A silent background check can start downloading on its own (Windows
      // auto-download) with no prior user action, so surface it immediately —
      // otherwise the only sign anything is happening is a small topbar label.
      if (next.state === 'downloading' && !hasAutoShownDownload.current) {
        hasAutoShownDownload.current = true
        setShowModal(true)
      }
    })
    const removeMenuListener = updater.onMenuCheckForUpdates?.(() => setShowModal(true))
    return () => {
      updater.removeUpdateListeners?.()
      removeMenuListener?.()
    }
  }, [])

  async function recheck() {
    const current = await window.electronAPI?.checkForUpdates()
    if (current) setStatus(current)
  }

  return { status, showModal, setShowModal, recheck }
}
