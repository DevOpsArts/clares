const { Router }   = require('express')
const db            = require('../db')
const requireAdmin  = require('../middleware/requireAdmin')

const router  = Router()
const NAME_RE = /^[a-zA-Z0-9 ._()\-\/]{1,300}$/

async function validTypes() {
  const { rows } = await db.query(`SELECT slug FROM catalog_types`)
  return rows.map((r) => r.slug)
}

function sanitize(row, knownTypes) {
  const { type, name, environment, expiry_date, owner, notes,
          email_enabled, reminder_days_before, reminder_count } = row

  if (!knownTypes.includes(type))  return { error: `type "${type}" is not a valid catalog type` }
  if (!name || !NAME_RE.test(name)) return { error: 'name is required and must be 1–300 safe characters' }
  if (!expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) return { error: 'expiry_date must be YYYY-MM-DD' }

  return {
    type,
    name,
    environment:          environment ? String(environment).slice(0, 100) : null,
    expiry_date,
    owner:                owner  ? String(owner).slice(0, 200)  : null,
    notes:                notes  ? String(notes).slice(0, 2000) : null,
    email_enabled:        email_enabled === true || email_enabled === 'true',
    reminder_days_before: parseInt(reminder_days_before, 10) || 30,
    reminder_count:       parseInt(reminder_count, 10)       || 3,
  }
}

const SELECT_COLS = `id, type, name, environment, expiry_date, owner, notes,
  email_enabled, reminder_days_before, reminder_count, created_at`

/** GET /api/renewals — list all, ordered by expiry asc */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${SELECT_COLS} FROM renewals ORDER BY expiry_date ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /renewals error:', err)
    res.status(500).json({ error: 'Failed to fetch renewals' })
  }
})

/** GET /api/renewals/type/:type — list by catalog type */
router.get('/type/:type', async (req, res) => {
  const { type } = req.params
  try {
    const types = await validTypes()
    if (!types.includes(type)) return res.status(404).json({ error: 'Unknown catalog type' })
    const { rows } = await db.query(
      `SELECT ${SELECT_COLS} FROM renewals WHERE type=$1 ORDER BY expiry_date ASC`, [type]
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /renewals/type error:', err)
    res.status(500).json({ error: 'Failed to fetch renewals' })
  }
})

/** POST /api/renewals — create (admin only) */
router.post('/', requireAdmin, async (req, res) => {
  const types  = await validTypes()
  const fields = sanitize(req.body, types)
  if (fields.error) return res.status(400).json({ error: fields.error })

  try {
    const { rows } = await db.query(
      `INSERT INTO renewals
         (type, name, environment, expiry_date, owner, notes,
          email_enabled, reminder_days_before, reminder_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${SELECT_COLS}`,
      [fields.type, fields.name, fields.environment, fields.expiry_date,
       fields.owner, fields.notes, fields.email_enabled,
       fields.reminder_days_before, fields.reminder_count, req.user.sub]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('POST /renewals error:', err)
    res.status(500).json({ error: 'Failed to create renewal entry' })
  }
})

/** POST /api/renewals/bulk — bulk create (admin only) */
router.post('/bulk', requireAdmin, async (req, res) => {
  const { rows: inputRows } = req.body
  if (!Array.isArray(inputRows) || inputRows.length === 0) {
    return res.status(400).json({ error: 'rows array is required and must not be empty' })
  }
  if (inputRows.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 rows per bulk upload' })
  }

  const types = await validTypes()
  const good = [], bad = []
  inputRows.forEach((row, i) => {
    const result = sanitize(row, types)
    if (result.error) bad.push({ row: i + 1, error: result.error })
    else good.push(result)
  })
  if (bad.length > 0) {
    return res.status(400).json({ error: 'Validation errors in bulk data', details: bad })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const inserted = []
    for (const f of good) {
      const { rows } = await client.query(
        `INSERT INTO renewals
           (type, name, environment, expiry_date, owner, notes,
            email_enabled, reminder_days_before, reminder_count, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING ${SELECT_COLS}`,
        [f.type, f.name, f.environment, f.expiry_date,
         f.owner, f.notes, f.email_enabled,
         f.reminder_days_before, f.reminder_count, req.user.sub]
      )
      inserted.push(rows[0])
    }
    await client.query('COMMIT')
    res.status(201).json({ inserted: inserted.length, rows: inserted })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('POST /renewals/bulk error:', err)
    res.status(500).json({ error: 'Bulk insert failed' })
  } finally {
    client.release()
  }
})

/** PUT /api/renewals/:id — update (admin only) */
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const types   = await validTypes()
  const { type, name, environment, expiry_date, owner, notes,
          email_enabled, reminder_days_before, reminder_count } = req.body

  if (type && !types.includes(type)) {
    return res.status(400).json({ error: `type "${type}" is not a valid catalog type` })
  }
  if (name && !NAME_RE.test(name)) return res.status(400).json({ error: 'name contains invalid characters' })
  if (expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
    return res.status(400).json({ error: 'expiry_date must be YYYY-MM-DD' })
  }

  try {
    const { rows } = await db.query(
      `UPDATE renewals SET
         type                 = COALESCE($1,  type),
         name                 = COALESCE($2,  name),
         environment          = COALESCE($3,  environment),
         expiry_date          = COALESCE($4,  expiry_date),
         owner                = COALESCE($5,  owner),
         notes                = COALESCE($6,  notes),
         email_enabled        = COALESCE($7,  email_enabled),
         reminder_days_before = COALESCE($8,  reminder_days_before),
         reminder_count       = COALESCE($9,  reminder_count),
         updated_at           = now()
       WHERE id = $10
       RETURNING ${SELECT_COLS}`,
      [
        type        || null,
        name        || null,
        environment          !== undefined ? String(environment).slice(0, 100)  : null,
        expiry_date          || null,
        owner                !== undefined ? String(owner).slice(0, 200)        : null,
        notes                !== undefined ? String(notes).slice(0, 2000)       : null,
        email_enabled        !== undefined ? (email_enabled === true || email_enabled === 'true') : null,
        reminder_days_before !== undefined ? (parseInt(reminder_days_before, 10) || null)         : null,
        reminder_count       !== undefined ? (parseInt(reminder_count, 10)       || null)         : null,
        id,
      ]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('PUT /renewals error:', err)
    res.status(500).json({ error: 'Failed to update renewal entry' })
  }
})

/** DELETE /api/renewals/:id — delete (admin only) */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM renewals WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /renewals error:', err)
    res.status(500).json({ error: 'Failed to delete renewal entry' })
  }
})

module.exports = router
