import styles from './SplashScreen.module.css'
import lcLogo from '../../../image/LC.png'

export default function SplashScreen() {
  return (
    <div className={styles.wrap}>
      <div className={styles.seal}>
        <div className={styles.ring1} />
        <div className={styles.ring2} />
        <img src={lcLogo} alt="LCMS" className={styles.logo} />
      </div>
      <p className={styles.label}>Leave Credits Management System (LCMS)</p>
      <p className={styles.sub}>Loading…</p>
      <div className={styles.progress} aria-hidden="true"><span /></div>
    </div>
  )
}
