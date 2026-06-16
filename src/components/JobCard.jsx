import styles from './JobCard.module.css'

export default function JobCard({ job }) {
  const posted = job.posted_at
    ? new Date(job.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <a href={job.url} target="_blank" rel="noopener noreferrer" className={styles.card}>
      <div className={styles.top}>
        <div>
          <h3 className={styles.title}>{job.title}</h3>
          <p className={styles.company}>{job.company}</p>
        </div>
        <span className={styles.source}>{job.source}</span>
      </div>
      <div className={styles.bottom}>
        <span className={styles.location}>
          {job.is_remote ? 'Remote' : job.location}
        </span>
        {job.salary_min && (
          <span className={styles.salary}>
            ${job.salary_min.toLocaleString()}
            {job.salary_max ? ` – $${job.salary_max.toLocaleString()}` : '+'}
          </span>
        )}
        {posted && <span className={styles.date}>{posted}</span>}
      </div>
    </a>
  )
}
