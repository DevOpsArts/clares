const { Router } = require('express')
const db          = require('../db')
const requireAdmin = require('../middleware/requireAdmin')

const router = Router()
const SLUG_RE = /^[a-z0-9_-]{1,50}$/

/** GET /api/catalog-types — list all */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, slug, label, is_builtin, created_at
       FROM catalog_types
       ORDER BY is_builtin DESC, label ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /catalog-types error:', err)
    res.status(500).json({ error: 'Failed to fetch catalog types' })
  }
})

/** POST /api/catalog-types — add custom type (admin only) */
router.post('/', requireAdmin, async (req, res) => {
  const { slug, label } = req.body

  if (!slug || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'slug must be 1–50 lowercase alphanumeric/dash/underscore characters' })
  }
  if (!label || typeof label !== 'string' || label.trim().length < 1 || label.length > 100) {
    return res.status(400).json({ error: 'label is required and must be 1–100 characters' })
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO catalog_types (slug, label, is_builtin)
       VALUES ($1, $2, false)
       RETURNING id, slug, label, is_builtin, created_at`,
      [slug.toLowerCase(), label.trim()]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Catalog type "${slug}" already exists` })
    }
    console.error('POST /catalog-types error:', err)
    res.status(500).json({ error: 'Failed to create catalog type' })
  }
})

/** DELETE /api/catalog-types/:slug — delete custom type (admin only) */
router.delete('/:slug', requireAdmin, async (req, res) => {
  const { slug } = req.params

  try {
    const { rows } = await db.query(
      `SELECT is_builtin FROM catalog_types WHERE slug = $1`, [slug]
    )
    if (!rows.length) return res.status(404).json({ error: 'Catalog type not found' })
    if (rows[0].is_builtin) return res.status(400).json({ error: 'Built-in catalog types cannot be deleted' })

    await db.query(`DELETE FROM catalog_types WHERE slug = $1`, [slug])
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /catalog-types error:', err)
    res.status(500).json({ error: 'Failed to delete catalog type' })
  }
})

module.exports = router
