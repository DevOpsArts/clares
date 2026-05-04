const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const express          = require('express')
const cors             = require('cors')
const authRoutes       = require('./routes/auth')
const renewalRoutes    = require('./routes/renewals')
const catalogRoutes    = require('./routes/catalog-types')
const adminRoutes      = require('./routes/admin')
const authenticate     = require('./middleware/authenticate')

const app  = express()
const PORT = process.env.PORT || 3002

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5174',
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

// ── Request logging ──────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  }
  next()
})

app.use('/api/auth',          authRoutes)
app.use('/api/renewals',      authenticate, renewalRoutes)
app.use('/api/catalog-types', authenticate, catalogRoutes)
app.use('/api/admin',         authenticate, adminRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// Serve static frontend in production
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// SPA fallback – serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`CLARES API  →  http://localhost:${PORT}`)
  console.log(`[Scheduler] Auto-reminder check runs every 60 s`)
})

// ── Auto-reminder scheduler ──────────────────────────────────
const pool = require('./db')
const nodemailer = require('nodemailer')

/**
 * Calculate the specific dates on which reminders should be sent.
 * E.g. expiry=June 10, daysBefore=30, count=3  →  May 11, May 21, May 31
 * (30, 20, 10 days before expiry)
 */
function getReminderDates(expiryDate, daysBefore, count) {
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  const interval = Math.floor(daysBefore / count)
  const dates = []
  for (let i = 0; i < count; i++) {
    const d = new Date(expiry)
    d.setDate(d.getDate() - daysBefore + (i * interval))
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr) - today) / 86400000)
}

let lastReminderDate = null

setInterval(async () => {
  try {
    const { rows: [cfg] } = await pool.query(
      `SELECT host, port, secure, username, password, from_email, from_name,
              auto_remind_enabled, auto_remind_hour
       FROM smtp_config WHERE id = 1`
    )
    if (!cfg?.auto_remind_enabled || !cfg.host) return

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const currentHour = now.getHours()

    // Run once per day at the configured hour
    if (currentHour !== cfg.auto_remind_hour) return
    if (lastReminderDate === todayStr) return
    lastReminderDate = todayStr

    console.log(`[Auto-Reminder] Running scheduled reminders at ${now.toISOString()}`)

    const { rows: renewals } = await pool.query(
      `SELECT r.id, r.type, r.name, r.environment, r.expiry_date, r.owner,
              r.reminder_days_before, r.reminder_count
       FROM renewals r
       WHERE r.email_enabled = true AND r.owner IS NOT NULL AND r.owner LIKE '%@%'
       ORDER BY r.expiry_date ASC`
    )

    // Get already-sent logs for today's candidates
    const ids = renewals.map(r => r.id)
    const { rows: logs } = ids.length
      ? await pool.query(`SELECT renewal_id, reminder_num FROM reminder_logs WHERE renewal_id = ANY($1)`, [ids])
      : { rows: [] }
    const sentSet = new Set(logs.map(l => `${l.renewal_id}:${l.reminder_num}`))

    // Find reminders due today or past-due (not yet sent)
    const toSend = []
    for (const r of renewals) {
      const dates = getReminderDates(r.expiry_date, r.reminder_days_before, r.reminder_count)
      for (let i = 0; i < dates.length; i++) {
        if (dates[i] <= todayStr && !sentSet.has(`${r.id}:${i + 1}`)) {
          toSend.push({ ...r, reminderNum: i + 1 })
        }
      }
    }

    if (toSend.length === 0) { console.log('[Auto-Reminder] No items due for reminders today.'); return }

    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
      tls: { rejectUnauthorized: false },
    })

    let sent = 0
    for (const r of toSend) {
      const days = daysUntil(r.expiry_date)
      const subject = `[CLARES] ${r.type.toUpperCase()} "${r.name}" expires in ${days < 0 ? 'OVERDUE' : `${days} day(s)`}`
      const expiryLabel = days < 0
        ? `<strong style="color:#dc2626">EXPIRED ${Math.abs(days)} day(s) ago</strong>`
        : `<strong style="color:${days <= 7 ? '#dc2626' : days <= 14 ? '#d97706' : '#059669'}">${days} day(s) remaining</strong>`
      try {
        await transporter.sendMail({
          from: `"${cfg.from_name}" <${cfg.from_email}>`,
          envelope: { from: cfg.from_email, to: r.owner },
          to: r.owner,
          subject,
          html: `<p>Hello,</p>
            <p>This is automated reminder ${r.reminderNum} of ${r.reminder_count} that the following item is expiring soon:</p>
            <table style="border-collapse:collapse;font-size:14px">
              <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Type</td><td><strong>${r.type}</strong></td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Name</td><td><strong>${r.name}</strong></td></tr>
              ${r.environment ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Environment</td><td>${r.environment}</td></tr>` : ''}
              <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Expiry Date</td><td>${r.expiry_date?.slice(0,10)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Status</td><td>${expiryLabel}</td></tr>
            </table>
            <p style="margin-top:16px">Please take action to renew this item before it expires.</p>
            <p style="color:#9ca3af;font-size:12px">— CLARES · Compliance License &amp; Asset Reminder Engine System</p>`,
        })
        await pool.query(
          `INSERT INTO reminder_logs (renewal_id, reminder_num) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [r.id, r.reminderNum]
        )
        sent++
      } catch (e) {
        console.error(`[Auto-Reminder] Failed to send to ${r.owner}: ${e.message}`)
      }
    }
    console.log(`[Auto-Reminder] Sent ${sent}/${toSend.length} reminder(s).`)
  } catch (err) {
    console.error('[Auto-Reminder] Scheduler error:', err.message)
  }
}, 60000) // check every 60 seconds
