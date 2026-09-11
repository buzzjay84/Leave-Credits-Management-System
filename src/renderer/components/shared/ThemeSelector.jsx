import { useTheme } from '@/hooks/useTheme'
import styles from './ThemeSelector.module.css'

export default function ThemeSelector({ compact = false }) {
  const { preference, setTheme } = useTheme()

  return (
    <label className={`${styles.control} ${compact ? styles.compact : ''}`}>
      <span>Theme</span>
      <select value={preference} onChange={event => setTheme(event.target.value)} aria-label="Application theme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}
