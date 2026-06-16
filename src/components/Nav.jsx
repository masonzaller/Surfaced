import { Link, useLocation } from 'react-router-dom'
import styles from './Nav.module.css'

export default function Nav() {
  const { pathname } = useLocation()

  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.logo}>Surfaced</Link>
      <div className={styles.links}>
        <Link to="/" className={pathname === '/' ? styles.active : ''}>Jobs</Link>
        <Link to="/filters" className={pathname === '/filters' ? styles.active : ''}>Filters</Link>
      </div>
    </nav>
  )
}
