/**
 * DB setup for CLARES (Compliance License & Asset Reminder Engine).
 * Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS guards.
 *
 * Run: node server/setup.js
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const bcrypt = require('bcrypt')
const pool   = require('./db')

async function setup() {
  const client = await pool.connect()
  try {
    console.log('Connected to database.')

    // ── users ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','viewer')),
        display_name  TEXT,
        email         TEXT,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    // Add email column if missing (migration for existing installs)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    `)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `)

    // Update role constraint to include 'viewer'
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `)
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','user','viewer'));
    `)

    // Seed default admin user (admin / admin) — only if no users exist
    const existing = await client.query('SELECT count(*) FROM users')
    if (parseInt(existing.rows[0].count, 10) === 0) {
      const hash = await bcrypt.hash('admin', 10)
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name, email)
         VALUES ($1, $2, 'admin', 'Administrator', 'admin@localhost')`,
        ['admin', hash]
      )
      console.log('✓ users table ready (default admin user created).')
    } else {
      console.log('✓ users table ready.')
    }

    // ── renewals ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS renewals (
        id                   SERIAL PRIMARY KEY,
        type                 TEXT NOT NULL,
        name                 TEXT NOT NULL,
        environment          TEXT,
        expiry_date          DATE NOT NULL,
        owner                TEXT,
        notes                TEXT,
        created_by           INTEGER,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    // Drop legacy CHECK constraint if it exists (from earlier schema)
    await client.query(`
      ALTER TABLE renewals DROP CONSTRAINT IF EXISTS renewals_type_check;
    `)

    // New email-reminder columns (idempotent)
    await client.query(`
      ALTER TABLE renewals
        ADD COLUMN IF NOT EXISTS email_enabled        BOOLEAN  NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER  NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS reminder_count       INTEGER  NOT NULL DEFAULT 3;
    `)
    console.log('✓ renewals table ready.')

    // ── catalog_types ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_types (
        id         SERIAL PRIMARY KEY,
        slug       TEXT NOT NULL UNIQUE,
        label      TEXT NOT NULL,
        is_builtin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    // Seed built-in catalog types
    await client.query(`
      INSERT INTO catalog_types (slug, label, is_builtin) VALUES
        ('ssl',         'SSL Certs',    true),
        ('license',     'Licenses',     true),
        ('certificate', 'Certificates', true)
      ON CONFLICT (slug) DO NOTHING;
    `)
    console.log('✓ catalog_types table ready.')

    // ── smtp_config ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS smtp_config (
        id         SERIAL PRIMARY KEY,
        host       TEXT NOT NULL DEFAULT '',
        port       INTEGER NOT NULL DEFAULT 587,
        secure     BOOLEAN NOT NULL DEFAULT false,
        username   TEXT NOT NULL DEFAULT '',
        password   TEXT NOT NULL DEFAULT '',
        from_email TEXT NOT NULL DEFAULT '',
        from_name  TEXT NOT NULL DEFAULT 'CLARES',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)

    // Ensure exactly one row exists
    await client.query(`
      INSERT INTO smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `)
    console.log('✓ smtp_config table ready.')

    // ── user_catalog_permissions ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_catalog_permissions (
        id           SERIAL PRIMARY KEY,
        user_id      TEXT NOT NULL,
        catalog_slug TEXT NOT NULL REFERENCES catalog_types(slug) ON DELETE CASCADE,
        role         TEXT NOT NULL CHECK (role IN ('admin','view')),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, catalog_slug)
      );
    `)
    console.log('✓ user_catalog_permissions table ready.')

    console.log('\nSetup complete.')
  } catch (err) {
    console.error('Setup error:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

setup()
