const express = require('express')
const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
const pool    = require('../db')

const router = express.Router()

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token, user }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (
    !username || !password ||
    typeof username !== 'string' || typeof password !== 'string' ||
    username.length > 100 || password.length > 200
  ) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash, role, display_name
       FROM users
       WHERE LOWER(username) = LOWER($1) AND is_active = true`,
      [username.trim()]
    )

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user  = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Fetch catalog-level permissions for this user
    const permsResult = await pool.query(
      `SELECT catalog_slug, role FROM user_catalog_permissions WHERE user_id = $1`,
      [String(user.id)]
    )
    const catalogPermissions = {}
    permsResult.rows.forEach((r) => { catalogPermissions[r.catalog_slug] = r.role })

    const payload = {
      sub:         user.id,
      username:    user.username,
      role:        user.role,
      displayName: user.display_name || user.username,
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    })

    return res.json({ token, user: { ...payload, catalogPermissions } })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
