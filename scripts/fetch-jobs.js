import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)

const SEARCH_TERMS = [
  'growth associate',
  'marketing coordinator',
  'community manager',
  'operations associate',
  'product coordinator',
  'developer relations',
  'crypto marketing',
  'web3 community',
  'AI operations',
  'growth analyst',
  'marketing analyst',
]

const EXCLUDE_KEYWORDS = [
  'senior', 'sr.', 'lead', 'director', 'manager', 'head of',
  'cold calling', 'BDR', 'SDR', 'account executive', 'quota',
  '5+ years', '7+ years', '10+ years'
]

async function fetchAdzunaJobs() {
  const jobs = []
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  for (const term of SEARCH_TERMS.slice(0, 5)) {
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=20&what=${encodeURIComponent(term)}&content-type=application/json&sort_by=date&max_days_old=1`
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
      console.error(`Adzuna error for "${term}":`, err.message)
    }
  }
  return jobs
}

async function fetchRemotiveJobs() {
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?category=marketing&limit=50')
    const data = await res.json()
    const marketingJobs = data.jobs || []

    const res2 = await fetch('https://remotive.com/api/remote-jobs?category=product&limit=50')
    const data2 = await res2.json()
    const productJobs = data2.jobs || []

    return [...marketingJobs, ...productJobs].map(j => ({
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
    }))
  } catch (err) {
    console.error('Remotive error:', err.message)
    return []
  }
}

function isRelevant(job) {
  const text = `${job.title} ${job.description}`.toLowerCase()
  return !EXCLUDE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

async function upsertJobs(jobs) {
  const relevant = jobs.filter(isRelevant)
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

  const jobRows = newJobs.slice(0, 20).map(j => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;">
        <a href="${j.url}" style="font-weight:600;color:#2563eb;text-decoration:none;">${j.title}</a><br/>
        <span style="color:#555;font-size:13px;">${j.company} · ${j.location}</span>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;">
        <span style="font-size:12px;color:#888;">${j.source}</span>
      </td>
    </tr>
  `).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#111;">Surfaced — ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</h2>
      <p style="color:#555;">${newJobs.length} new jobs found today matching your profile.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${jobRows}
      </table>
      <p style="color:#999;font-size:12px;margin-top:24px;">
        <a href="https://surfaced.netlify.app" style="color:#2563eb;">View all jobs →</a>
      </p>
    </div>
  `

  await resend.emails.send({
    from: 'Surfaced <digest@surfaced.app>',
    to: process.env.DIGEST_EMAIL_TO,
    subject: `${newJobs.length} new jobs for you — ${new Date().toLocaleDateString()}`,
    html,
  })

  console.log(`Digest sent with ${newJobs.length} jobs.`)
}

async function main() {
  console.log('Fetching jobs...')
  const [adzunaJobs, remotiveJobs] = await Promise.all([
    fetchAdzunaJobs(),
    fetchRemotiveJobs(),
  ])

  const allJobs = [...adzunaJobs, ...remotiveJobs]
  console.log(`Fetched ${allJobs.length} raw jobs`)

  const newJobs = await upsertJobs(allJobs)
  console.log(`${newJobs.length} new jobs inserted`)

  await sendDigest(newJobs)
}

main().catch(console.error)
