import { useEffect, useRef, useState } from 'react'
import styles from './ConfirmDialog.module.css'

// Electron does not implement window.prompt() (only alert/confirm work) — it
// either silently returns null or throws depending on version, so a button
// wired to window.prompt() looks like it does nothing when clicked. This is
// the in-app replacement: same "null means cancelled" contract as
// window.prompt, but as a real modal.
export default function PromptDialog({ title, message, placeholder = '', confirmLabel = 'Submit', onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="prompt-dialog-title" aria-describedby="prompt-dialog-message">
        <h2 id="prompt-dialog-title">{title}</h2>
        <p id="prompt-dialog-message">{message}</p>
        <textarea
          ref={inputRef}
          rows={3}
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', marginTop: 12, padding: 8, borderRadius: 8, border: '1px solid #9ca3af', font: 'inherit', resize: 'vertical' }}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.confirm} onClick={() => onSubmit(value)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
