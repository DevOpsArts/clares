const { Router }  = require('express')
const db           = require('../db')
const requireAdmin = require('../middleware/requireAdmin')
const nodemailer   = require('nodemailer')
const bcrypt       = require('bcrypt')

const router = Router()

/** Build a nodemailer transporter */
function createSmtpTransporter(cfg) {
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    tls:    { rejectUnauthorized: false },
  })
}

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr) - today) / (1000 * 60 * 60 * 24))
}

/** GET /api/admin/smtp — get config (password masked) */
router.get('/smtp', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT host, port, secure, username, from_email, from_name,
              CASE WHEN password <> '' THEN '••••••••' ELSE '' END AS password
       FROM smtp_config WHERE id = 1`
    )
    res.json(rows[0] || {})
  } catch (err) {
    console.error('GET /admin/smtp error:', err)
    res.status(500).json({ error: 'Failed to fetch SMTP config' })
  }
})

/** PUT /api/admin/smtp — save config */
router.put('/smtp', requireAdmin, async (req, res) => {
  const { host, port, secure, username, password, from_email, from_name } = req.body

  if (!host || typeof host !== 'string' || host.length > 253) {
    return res.status(400).json({ error: 'host is required' })
  }
  if (!from_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from_email)) {
    return res.status(400).json({ error: 'from_email must be a valid email address' })
  }

  try {
    // If password is the masked placeholder, keep the existing password
    let pwQuery, pwParams
    if (!password || password === '••••••••') {
      pwQuery = `UPDATE smtp_config SET
        host=$1, port=$2, secure=$3, username=$4,
        from_email=$5, from_name=$6, updated_at=now()
        WHERE id=1 RETURNING host, port, secure, username, from_email, from_name`
      pwParams = [
        host.trim(), parseInt(port, 10) || 587, !!secure,
        (username || '').trim(), from_email.trim(), (from_name || 'CLARES').trim(),
      ]
    } else {
      pwQuery = `UPDATE smtp_config SET
        host=$1, port=$2, secure=$3, username=$4, password=$5,
        from_email=$6, from_name=$7, updated_at=now()
        WHERE id=1 RETURNING host, port, secure, username, from_email, from_name`
      pwParams = [
        host.trim(), parseInt(port, 10) || 587, !!secure,
        (username || '').trim(), password,
        from_email.trim(), (from_name || 'CLARES').trim(),
      ]
    }

    const { rows } = await db.query(pwQuery, pwParams)
    res.json({ ok: true, config: rows[0] })
  } catch (err) {
    console.error('PUT /admin/smtp error:', err)
    res.status(500).json({ error: 'Failed to save SMTP config' })
  }
})

/** POST /api/admin/smtp/test — verify SMTP connection */
router.post('/smtp/test', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT host, port, secure, username, password, from_email, from_name FROM smtp_config WHERE id=1`
    )
    const cfg = rows[0]
    if (!cfg?.host) return res.status(400).json({ error: 'SMTP not configured yet' })

    const transporter = createSmtpTransporter(cfg)
    await transporter.verify()
    res.json({ ok: true, message: 'SMTP connection successful' })
  } catch (err) {
    console.error('SMTP test error:', err)
    res.status(400).json({ error: `SMTP test failed: ${err.message}` })
  }
})

/** POST /api/admin/smtp/test-email — send a test email to a specific address */
router.post('/smtp/test-email', requireAdmin, async (req, res) => {
  const { to } = req.body
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'A valid email address is required' })
  }
  try {
    const { rows } = await db.query(
      `SELECT host, port, secure, username, password, from_email, from_name FROM smtp_config WHERE id=1`
    )
    const cfg = rows[0]
    if (!cfg?.host) return res.status(400).json({ error: 'SMTP not configured yet. Save settings first.' })

    const transporter = createSmtpTransporter(cfg)

    await transporter.sendMail({
      from:     `"${cfg.from_name}" <${cfg.from_email}>`,
      envelope: { from: cfg.from_email, to },
      to,
      subject: '[CLARES] Test Email',
      html: `
        <div style="font-family:sans-serif;max-width:480px">
          <h2 style="color:#1d4ed8">CLARES — Test Email</h2>
          <p>This is a test email from <strong>CLARES</strong> (Compliance License &amp; Asset Reminder Engine System).</p>
          <p>If you received this, your SMTP settings are configured correctly.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p style="color:#9ca3af;font-size:12px">Sent from CLARES at ${new Date().toISOString()}</p>
        </div>
      `,
    })

    res.json({ ok: true, message: `Test email sent to ${to}` })
  } catch (err) {
    console.error('Send test email error:', err)
    res.status(400).json({ error: `Failed to send test email: ${err.message}` })
  }
})

/** POST /api/admin/send-reminders — send emails for items within their reminder window */
router.post('/send-reminders', requireAdmin, async (_req, res) => {
  try {
    const [smtpRes, renewalsRes] = await Promise.all([
      db.query(`SELECT host, port, secure, username, password, from_email, from_name FROM smtp_config WHERE id=1`),
      db.query(`SELECT id, type, name, environment, expiry_date, owner, email_enabled, reminder_days_before
                FROM renewals
                WHERE email_enabled = true AND owner IS NOT NULL AND owner LIKE '%@%'
                ORDER BY expiry_date ASC`),
    ])

    const cfg = smtpRes.rows[0]
    if (!cfg?.host) return res.status(400).json({ error: 'SMTP not configured. Go to Admin → SMTP Settings.' })

    const transporter = createSmtpTransporter(cfg)

    const due = renewalsRes.rows.filter((r) => {
      const days = daysUntil(r.expiry_date)
      return days <= r.reminder_days_before
    })

    if (due.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No items currently in reminder window.' })
    }

    let sent = 0
    const errors = []

    for (const r of due) {
      const days = daysUntil(r.expiry_date)
      const subject = `[CLARES] ${r.type.toUpperCase()} "${r.name}" expires in ${days < 0 ? 'OVERDUE' : `${days} day(s)`}`
      const expiryLabel = days < 0
        ? `<strong style="color:#dc2626">EXPIRED ${Math.abs(days)} day(s) ago</strong>`
        : `<strong style="color:${days <= 7 ? '#dc2626' : days <= 14 ? '#d97706' : '#059669'}">${days} day(s) remaining</strong>`

      const html = `
        <p>Hello,</p>
        <p>This is a reminder that the following item is expiring soon:</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Type</td><td><strong>${r.type}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Name</td><td><strong>${r.name}</strong></td></tr>
          ${r.environment ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Environment</td><td>${r.environment}</td></tr>` : ''}
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Expiry Date</td><td>${r.expiry_date?.slice(0,10)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Status</td><td>${expiryLabel}</td></tr>
        </table>
        <p style="margin-top:16px">Please take action to renew this item before it expires.</p>
        <p style="color:#9ca3af;font-size:12px">— CLARES · Compliance License &amp; Asset Reminder Engine System</p>
      `

      try {
        await transporter.sendMail({
          from:     `"${cfg.from_name}" <${cfg.from_email}>`,
          envelope: { from: cfg.from_email, to: r.owner },
          to:      r.owner,
          subject,
          html,
        })
        sent++
      } catch (e) {
        errors.push({ name: r.name, error: e.message })
      }
    }

    res.json({
      ok: true,
      sent,
      total: due.length,
      errors: errors.length ? errors : undefined,
      message: `Sent ${sent} of ${due.length} reminder email(s).${errors.length ? ` ${errors.length} failed.` : ''}`,
    })
  } catch (err) {
    console.error('POST /admin/send-reminders error:', err)
    res.status(500).json({ error: 'Failed to send reminders' })
  }
})

// ═══════════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const USER_COLS = `id, username, display_name, email, role, is_active, created_at`
const USERNAME_RE = /^[a-zA-Z0-9._@-]{3,100}$/

/** GET /api/admin/users */
router.get('/users', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${USER_COLS} FROM users ORDER BY created_at ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /admin/users error:', err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

/** POST /api/admin/users — create user */
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, display_name, email, role } = req.body

  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'username must be 3–100 alphanumeric/._@- characters' })
  }
  if (!password || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'password must be 8–200 characters' })
  }
  if (!['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be "admin" or "viewer"' })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'email is not valid' })
  }

  try {
    const hash = await bcrypt.hash(password, 12)
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, display_name, email, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING ${USER_COLS}`,
      [username.trim(), hash, (display_name || '').trim() || null, email?.trim() || null, role]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    console.error('POST /admin/users error:', err)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

/** PUT /api/admin/users/:id — update display_name, email, role, is_active */
router.put('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { display_name, email, role, is_active, password } = req.body

  // Prevent admin from de-activating themselves
  if (req.user.sub === id && is_active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' })
  }
  if (role && !['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be "admin" or "viewer"' })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'email is not valid' })
  }

  try {
    // Optional password reset
    if (password) {
      if (password.length < 8 || password.length > 200) {
        return res.status(400).json({ error: 'password must be 8–200 characters' })
      }
      const hash = await bcrypt.hash(password, 12)
      await db.query(`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, id])
    }

    const { rows } = await db.query(
      `UPDATE users SET
         display_name = COALESCE($1, display_name),
         email        = COALESCE($2, email),
         role         = COALESCE($3, role),
         is_active    = COALESCE($4, is_active),
         updated_at   = now()
       WHERE id = $5
       RETURNING ${USER_COLS}`,
      [
        display_name !== undefined ? (display_name.trim() || null) : null,
        email        !== undefined ? (email.trim()        || null) : null,
        role         || null,
        is_active    !== undefined ? is_active : null,
        id,
      ]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('PUT /admin/users error:', err)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

/** GET /api/admin/users/:id/permissions */
router.get('/users/:id/permissions', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT catalog_slug, role FROM user_catalog_permissions WHERE user_id = $1`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /admin/users/:id/permissions error:', err)
    res.status(500).json({ error: 'Failed to fetch permissions' })
  }
})

/** PUT /api/admin/users/:id/permissions
 *  Body: { permissions: [{ catalog_slug, role }] }
 *  Replaces all permissions for that user.
 */
router.put('/users/:id/permissions', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { permissions } = req.body

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array' })
  }
  for (const p of permissions) {
    if (!p.catalog_slug || !['admin', 'view'].includes(p.role)) {
      return res.status(400).json({ error: 'each permission needs catalog_slug and role (admin|view)' })
    }
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM user_catalog_permissions WHERE user_id = $1`, [id])
    for (const p of permissions) {
      await client.query(
        `INSERT INTO user_catalog_permissions (user_id, catalog_slug, role) VALUES ($1, $2, $3)`,
        [id, p.catalog_slug, p.role]
      )
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('PUT /admin/users/:id/permissions error:', err)
    res.status(500).json({ error: 'Failed to save permissions' })
  } finally {
    client.release()
  }
})

module.exports = router
