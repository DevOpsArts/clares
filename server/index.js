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

app.use('/api/auth',          authRoutes)
app.use('/api/renewals',      authenticate, renewalRoutes)
app.use('/api/catalog-types', authenticate, catalogRoutes)
app.use('/api/admin',         authenticate, adminRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`CLARES API  →  http://localhost:${PORT}`)
})
