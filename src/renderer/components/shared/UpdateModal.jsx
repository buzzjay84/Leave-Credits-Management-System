import { useEffect } from 'react'
import styles from './UpdateModal.module.css'

export default function UpdateModal({ status, onClose, onRecheck, onInstall, onOpenRelease }) {
  // Mirrors the on-open re-check behavior of the reference update UI — opening
  // the dialog with nothing already in flight kicks off a fresh check instead
  // of showing stale state from the last background check.
  useEffect(() => {
    if (['idle', 'current', 'error'].includes(status.state)) onRecheck?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function body() {
    switch (status.state) {
      case 'checking':
        return (
          <>
            <div className={styles.spinner} />
            <p className={styles.msg}>Checking for updates…</p>
          </>
        )
      case 'current':
        return (
          <>
            <div className={`${styles.icon} ${styles.iconOk}`}>✓</div>
            <p className={styles.msg}>You're on the latest version{status.version ? ` (v${status.version})` : ''}.</p>
          </>
        )
      case 'downloading':
        return (
          <>
            <div className={styles.progressWrap}>
              <div className={styles.progressBar} style={{ width: `${status.percent || 0}%` }} />
            </div>
            <p className={styles.msg}>Downloading update… {status.percent || 0}%</p>
          </>
        )
      case 'downloaded':
        return (
          <>
            <div className={`${styles.icon} ${styles.iconOk}`}>✓</div>
            <p className={styles.msg}>
              {status.version ? `Version ${status.version} ` : 'The update '}is ready to install.
            </p>
            <button className={styles.actionBtn} onClick={onInstall}>Restart &amp; Install</button>
          </>
        )
      case 'available':
        return (
          <>
            <div className={`${styles.icon} ${styles.iconNew}`}>↑</div>
            <p className={styles.msg}>
              {status.version ? `Version ${status.version} ` : 'A new version '}is available.
            </p>
            <p className={styles.sub}>Open the GitHub Release page to download the installer for this platform.</p>
            <button className={styles.actionBtn} onClick={onOpenRelease}>Open GitHub Release</button>
          </>
        )
      case 'development':
        return (
          <>
            <div className={`${styles.icon} ${styles.iconNew}`}>ℹ</div>
            <p className={styles.msg}>Updates are only checked in the installed application.</p>
          </>
        )
      case 'error':
        return (
          <>
            <div className={`${styles.icon} ${styles.iconErr}`}>✕</div>
            <p className={styles.msg}>Update check failed.</p>
            {status.message && <p className={styles.sub}>{status.message}</p>}
            <button className={styles.actionBtn} onClick={onRecheck}>Try Again</button>
          </>
        )
      default:
        return (
          <>
            <div className={styles.spinner} />
            <p className={styles.msg}>Checking for updates…</p>
          </>
        )
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Check for Updates</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>{body()}</div>
      </div>
    </div>
  )
}
