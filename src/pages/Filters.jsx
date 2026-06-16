import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Filters.module.css'

const DEFAULT_KEYWORDS = [
  'growth associate', 'marketing coordinator', 'community manager',
  'operations associate', 'product coordinator', 'developer relations',
  'crypto marketing', 'web3 community', 'AI operations', 'growth analyst',
]

const DEFAULT_EXCLUDES = [
  'BDR', 'SDR', 'cold calling', 'account executive', 'quota',
  'senior', 'director', 'manager', '5+ years', '7+ years',
]

export default function Filters() {
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS.join(', '))
  const [excludes, setExcludes] = useState(DEFAULT_EXCLUDES.join(', '))
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('filters').select('*').eq('name', 'default').single()
      if (data) {
        setKeywords(data.keywords?.join(', ') || '')
        setExcludes(data.exclude_keywords?.join(', ') || '')
        setRemoteOnly(data.remote_only || false)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    const payload = {
      name: 'default',
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      exclude_keywords: excludes.split(',').map(k => k.trim()).filter(Boolean),
      remote_only: remoteOnly,
    }
    await supabase.from('filters').upsert(payload, { onConflict: 'name' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60, color: '#9ca3af' }}>Loading...</p>

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Search Filters</h1>
      <p className={styles.sub}>These control what jobs get fetched and emailed to you each morning.</p>

      <div className={styles.field}>
        <label className={styles.label}>Search keywords</label>
        <p className={styles.hint}>Comma-separated. These are the terms we search job boards for.</p>
        <textarea
          className={styles.textarea}
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          rows={4}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Exclude keywords</label>
        <p className={styles.hint}>Jobs containing any of these words will be filtered out.</p>
        <textarea
          className={styles.textarea}
          value={excludes}
          onChange={e => setExcludes(e.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={e => setRemoteOnly(e.target.checked)}
          />
          Remote jobs only
        </label>
      </div>

      <button className={styles.btn} onClick={save}>
        {saved ? 'Saved!' : 'Save Filters'}
      </button>
    </div>
  )
}
