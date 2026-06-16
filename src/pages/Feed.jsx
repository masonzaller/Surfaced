import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import JobCard from '../components/JobCard'
import styles from './Feed.module.css'

const SOURCES = ['all', 'adzuna', 'remotive']

export default function Feed() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState('all')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase
        .from('jobs')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(100)

      if (source !== 'all') query = query.eq('source', source)
      if (remoteOnly) query = query.eq('is_remote', true)

      const { data, error } = await query
      if (error) console.error(error)
      setJobs(data || [])
      setLoading(false)
    }
    load()
  }, [source, remoteOnly])

  const filtered = search
    ? jobs.filter(j =>
        j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.company.toLowerCase().includes(search.toLowerCase())
      )
    : jobs

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Your Job Feed</h1>
        <p className={styles.sub}>Updated daily. Click any card to apply.</p>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search jobs or companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          <div className={styles.tabs}>
            {SOURCES.map(s => (
              <button
                key={s}
                className={`${styles.tab} ${source === s ? styles.activeTab : ''}`}
                onClick={() => setSource(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={e => setRemoteOnly(e.target.checked)}
            />
            Remote only
          </label>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Loading jobs...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>No jobs found. Check back after the next daily fetch.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  )
}
