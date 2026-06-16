import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

const DEFAULT_KEYWORDS = [
  'growth associate',
  'marketing coordinator',
  'community manager',
  'operations associate',
  'product coordinator',
  'developer relations',
  'growth analyst',
  'marketing analyst',
  'content marketing',
  'social media manager',
  'crypto marketing',
  'web3 community',
]

const DEFAULT_EXCLUDES = [
  'BDR', 'SDR', 'cold calling', 'account executive', 'quota',
  'senior', 'sr.', 'director', 'vice president', 'vp',
  '5+ years', '7+ years', '10+ years',
  'forklift', 'driver', 'warehouse', 'retail', 'cashier',
  'nurse', 'technician', 'mechanic', 'electrician',
]

// Title must contain at least one of these to be considered relevant
const TITLE_MUST_INCLUDE = [
  'marketing', 'growth', 'operations', 'community', 'product',
  'coordinator', 'analyst', 'developer relations', 'devrel',
  'content', 'social media', 'brand', 'partnerships',
  'crypto', 'web3', 'blockchain', 'ai ', 'communications',
]

async function loadFilters() {
  const { data } = await supabase
    .from('filters')
    .select('*')
    .eq('name', 'default')
    .single()

  return {
    keywords: data?.keywords?.length ? data.keywords : DEFAULT_KEYWORDS,
    excludeKeywords: data?.exclude_keywords?.length ? data.exclude_keywords : DEFAULT_EXCLUDES,
    locations: data?.locations?.length ? data.locations : ['Cleveland, OH', 'Remote'],
    excludeCompanies: data?.exclude_companies?.length ? data.exclude_companies : [],
    remoteOnly: data?.remote_only || false,
  }
}

async function fetchAdzunaJobs(keywords, locations, remoteOnly) {
  const jobs = []
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  // Build list of where params: one per non-remote location + "remote" if wanted
  const whereParams = []
  if (!remoteOnly) {
    locations.filter(l => !l.toLowerCase().includes('remote')).forEach(l => {
      whereParams.push(l.split(',')[0].trim()) // just the city name
    })
  }
  const wantsRemote = remoteOnly || locations.some(l => l.toLowerCase().includes('remote'))
  if (wantsRemote) whereParams.push('remote')
  if (!whereParams.length) whereParams.push('') // no location filter

  for (const term of keywords) {
    for (const where of whereParams) {
      try {
        let url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=15&what_phrase=${encodeURIComponent(term)}&content-type=application/json&sort_by=date&max_days_old=3`
        if (where) url += `&where=${encodeURIComponent(where)}`

        const res = await fetch(url)
        const data = await res.json()
        if (data.results) {
          jobs.push(...data.results.map(j => ({
            external_id: `adzuna_${j.id}`,
            title: j.title,
            company: j.company?.display_name || 'Unknown',
            location: j.location?.display_name || 'Remote',
            url: j.redirect_url,
            description: j.description,
            source: 'adzuna',
            is_remote: j.location?.display_name?.toLowerCase().includes('remote') || false,
            salary_min: j.salary_min ? Math.round(j.salary_min) : null,
            salary_max: j.salary_max ? Math.round(j.salary_max) : null,
            posted_at: j.created,
          })))
        }
      } catch (err) {
        console.error(`Adzuna error for "${term}" / "${where}":`, err.message)
      }
    }
  }
  return jobs
}

async function fetchRemotiveJobs() {
  const categories = ['marketing', 'product', 'all-others']
  const jobs = []

  for (const cat of categories) {
    try {
      const res = await fetch(`https://remotive.com/api/remote-jobs?category=${cat}&limit=50`)
      const data = await res.json()
      jobs.push(...(data.jobs || []).map(j => ({
        external_id: `remotive_${j.id}`,
        title: j.title,
        company: j.company_name,
        location: 'Remote',
        url: j.url,
        description: j.description,
        source: 'remotive',
        is_remote: true,
        salary_min: null,
        salary_max: null,
        posted_at: j.publication_date,
      })))
    } catch (err) {
      console.error(`Remotive error for "${cat}":`, err.message)
    }
  }
  return jobs
}

function isRelevant(job, excludeKeywords, excludeCompanies, locations, remoteOnly) {
  const title = job.title.toLowerCase()
  const company = job.company.toLowerCase()
  const location = job.location.toLowerCase()
  const isRemote = job.is_remote || location.includes('remote')

  // Reject excluded companies
  if (excludeCompanies.some(c => company.includes(c.toLowerCase()))) return false

  // Reject if title contains any excluded keyword
  if (excludeKeywords.some(kw => title.includes(kw.toLowerCase()))) return false

  // Require title to contain at least one relevant keyword
  if (!TITLE_MUST_INCLUDE.some(kw => title.includes(kw.toLowerCase()))) return false

  // Location filter
  if (remoteOnly) return isRemote

  if (locations.length > 0) {
    const wantsRemote = locations.some(l => l.toLowerCase().includes('remote'))
    if (isRemote && wantsRemote) return true
    // Match on city name only (Adzuna returns "Cleveland, Cuyahoga County" not "Cleveland, OH")
    const cities = locations
      .filter(l => !l.toLowerCase().includes('remote'))
      .map(l => l.split(',')[0].toLowerCase().trim())
    return cities.some(city => location.includes(city))
  }

  return true
}

async function upsertJobs(jobs, excludeKeywords, excludeCompanies, locations, remoteOnly) {
  const relevant = jobs.filter(j => isRelevant(j, excludeKeywords, excludeCompanies, locations, remoteOnly))
  console.log(`${relevant.length} jobs passed relevance filter (out of ${jobs.length} raw)`)
  if (!relevant.length) return []

  const { data, error } = await supabase
    .from('jobs')
    .upsert(relevant, { onConflict: 'external_id', ignoreDuplicates: true })
    .select()

  if (error) console.error('Supabase upsert error:', error.message)
  return data || []
}

async function sendDigest(newJobs) {
  if (!newJobs.length) {
    console.log('No new jobs to send today.')
    return
  }

  const jobRows = newJobs.slice(0, 25).map(j => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;">
        <a href="${j.url}" style="font-weight:600;color:#2563eb;text-decoration:none;">${j.title}</a><br/>
        <span style="color:#555;font-size:13px;">${j.company} · ${j.is_remote ? 'Remote' : j.location}</span>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
        ${j.salary_min ? `<span style="color:#059669;font-size:13px;">$${j.salary_min.toLocaleString()}</span><br/>` : ''}
        <span style="font-size:11px;color:#aaa;text-transform:uppercase;">${j.source}</span>
      </td>
    </tr>
  `).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px;">
      <h2 style="color:#111;margin-bottom:4px;">Surfaced</h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px;">
        ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })} · ${newJobs.length} new jobs found
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${jobRows}
      </table>
      <p style="margin-top:24px;">
        <a href="https://getsurfaced.netlify.app" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">View all jobs →</a>
      </p>
      <p style="color:#d1d5db;font-size:11px;margin-top:24px;">Surfaced · Unsubscribe</p>
    </div>
  `

  await resend.emails.send({
    from: 'Surfaced <onboarding@resend.dev>',
    to: process.env.DIGEST_EMAIL_TO,
    subject: `${newJobs.length} new jobs for you — ${new Date().toLocaleDateString()}`,
    html,
  })

  console.log(`Digest sent with ${newJobs.length} jobs.`)
}

async function main() {
  console.log('Loading filters from Supabase...')
  const { keywords, excludeKeywords, remoteOnly } = await loadFilters()
  console.log(`Using ${keywords.length} search terms, ${excludeKeywords.length} exclude terms`)

  console.log('Fetching jobs...')
  const [adzunaJobs, remotiveJobs] = await Promise.all([
    fetchAdzunaJobs(keywords, locations, remoteOnly),
    fetchRemotiveJobs(),
  ])

  const allJobs = [...adzunaJobs, ...remotiveJobs]
  console.log(`Fetched ${allJobs.length} raw jobs`)

  const newJobs = await upsertJobs(allJobs, excludeKeywords, excludeCompanies, locations, remoteOnly)
  console.log(`${newJobs.length} new jobs inserted`)

  await sendDigest(newJobs)
}

main().catch(console.error)
