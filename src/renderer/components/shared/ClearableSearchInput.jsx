import styles from './ClearableSearchInput.module.css'

export default function ClearableSearchInput({ value, onChange, className = '', ...props }) {
  return <div className={`${styles.wrap} ${className}`}>
    <input {...props} type="search" value={value} onChange={onChange} className={styles.input} />
    {value && <button type="button" className={styles.clear} onClick={() => onChange({ target: { value: '' } })} aria-label="Clear search" title="Clear search">×</button>}
  </div>
}
