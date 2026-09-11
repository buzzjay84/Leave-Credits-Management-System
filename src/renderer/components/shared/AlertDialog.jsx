import { useEffect, useRef } from 'react'
import styles from './ConfirmDialog.module.css'

// In-app replacement for window.alert(). Electron's native alert()/confirm()
// leave the renderer's focus state out of sync with the OS once dismissed —
// buttons stop responding to clicks until the window loses and regains focus
// (e.g. tabbing out and back in). Routing every error/notice through a real
// React modal avoids that class of bug entirely.
export default function AlertDialog({ title = 'Notice', message, confirmLabel = 'OK', onClose }) {
  const okRef = useRef(null)

  useEffect(() => {
    okRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape' || event.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-message">
        <h2 id="alert-dialog-title">{title}</h2>
        <p id="alert-dialog-message" style={{ whiteSpace: 'pre-line' }}>{message}</p>
        <div className={styles.actions}>
          <button ref={okRef} type="button" className={styles.confirm} onClick={onClose}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
