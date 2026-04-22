# CLARES — Compliance License & Asset Reminder Engine

A full-stack web portal for tracking and managing expiry dates of SSL certificates, licenses, certificates, and any custom asset type. Sends email reminders before items expire.

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 18, Vite, React Router v6   |
| Backend    | Node.js, Express 4                |
| Database   | PostgreSQL (Azure)                |
| Auth       | JWT (8h expiry), bcrypt           |
| Email      | Nodemailer (configurable SMTP)    |
| Dev tools  | concurrently, nodemon             |

---

## Prerequisites

- Node.js 18+
- A PostgreSQL database (Azure or local)
- An SMTP server (optional, for email reminders)

---

## Getting Started

### 1. Clone & install

```bash
git clone <repo-url>
cd clares
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
# PostgreSQL connection
PGHOST=your-db-host.postgres.database.azure.com
PGPORT=5432
PGDATABASE=your-database-name
PGUSER=your-db-user
PGPASSWORD=your-db-password

# JWT secret (use a long random string)
JWT_SECRET=your_super_secret_jwt_key

# Server port (optional, default: 3002)
PORT=3002

# Frontend origin (optional, default: http://localhost:5174)
CLIENT_ORIGIN=http://localhost:5174
```

### 3. Set up the database

Run the migration script to create all required tables and seed built-in catalog types:

```bash
npm run setup-db
```

This creates:
- `renewals` — tracked items with expiry dates
- `catalog_types` — asset categories (ssl, license, certificate + any custom)
- `smtp_config` — email sender configuration
- `user_catalog_permissions` — per-user access control per catalog

> Re-running `setup-db` is safe — all migrations are idempotent.

### 4. Create the first admin user

Connect to your database and insert an admin account (bcrypt hash for your password):

```sql
-- Generate a bcrypt hash first (e.g. using Node):
-- node -e "const b=require('bcrypt'); b.hash('yourpassword',12).then(console.log)"

INSERT INTO users (username, password_hash, role, display_name, is_active)
VALUES ('admin', '<bcrypt_hash>', 'admin', 'Administrator', true);
```

### 5. Start the development server

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend**: http://localhost:5174
- **API**: http://localhost:3002

---

## Available Scripts

| Command           | Description                                    |
|-------------------|------------------------------------------------|
| `npm run dev`     | Start frontend (Vite) + backend (nodemon)      |
| `npm run build`   | Build frontend for production                  |
| `npm run preview` | Preview the production build locally           |
| `npm run setup-db`| Run DB migration / setup script               |

---

## Project Structure

```
├── index.html
├── package.json
├── vite.config.js
│
├── server/                     # Express API
│   ├── index.js                # Entry point
│   ├── db.js                   # PostgreSQL pool
│   ├── setup.js                # DB migration script
│   ├── middleware/
│   │   ├── authenticate.js     # JWT verification
│   │   └── requireAdmin.js     # Admin-only guard
│   └── routes/
│       ├── auth.js             # Login / profile
│       ├── renewals.js         # CRUD for renewal entries + bulk import
│       ├── catalog-types.js    # Manage catalog categories
│       └── admin.js            # SMTP config, email reminders, user management
│
└── src/                        # React frontend
    ├── main.jsx
    ├── App.jsx                 # Route definitions
    ├── components/
    │   ├── ClaresLogo.jsx      # Reusable shield logo SVG
    │   ├── Layout.jsx          # App shell (navbar + sidebar)
    │   ├── Sidebar.jsx         # Left navigation with catalog list
    │   ├── Login.jsx           # Split-panel login page
    │   ├── ProtectedRoute.jsx  # Auth guard component
    │   └── RenewalAlertModal.jsx
    ├── context/
    │   └── AuthContext.jsx     # Auth state + login/logout
    ├── pages/
    │   ├── HomePage.jsx        # Dashboard — expiry attention view
    │   ├── CatalogPage.jsx     # Per-catalog CRUD + bulk CSV upload
    │   ├── AdminPage.jsx       # SMTP settings + send reminders
    │   └── UserManagementPage.jsx  # Add/edit users + permissions
    └── services/
        └── api.js              # All API client calls
```

---

## Features

### Dashboard (Home)
- Grouped urgency sections: **Expired**, **Critical ≤14d**, **Warning ≤30d**, **Upcoming ≤90d**
- Summary stat cards per catalog type
- Auto-refreshed on load — no manual refresh needed

### Catalogs
- Built-in types: **Certificates**, **Licenses**, **SSL Certs**
- Add custom catalog types from the sidebar
- Per-catalog item management (add, edit, delete)
- **Bulk CSV upload** — download template, upload up to 500 rows at once
- Per-item **email reminder** settings (toggle, days before, repeat count)

### Email Reminders
- Configure SMTP (host, port, TLS, credentials, from address)
- Test connection before saving
- Trigger reminders manually from Admin page
- Sends to item `owner` field (must contain `@`)

### User Management *(Admin only)*
- Create and manage user accounts
- Assign role: **Admin** (full access) or **Viewer** (read-only)
- Per-catalog permission matrix (No Access / View / Admin)
- Activate / deactivate accounts

### UI
- Responsive layout — sidebar collapses on mobile, toggles on desktop
- Collapsible left sidebar via hamburger button
- Navy/white color scheme

---

## API Endpoints

| Method | Path                              | Auth     | Description                    |
|--------|-----------------------------------|----------|--------------------------------|
| POST   | `/api/auth/login`                 | Public   | Login, returns JWT             |
| GET    | `/api/renewals`                   | Required | All renewals                   |
| GET    | `/api/renewals/type/:type`        | Required | Renewals by catalog type       |
| POST   | `/api/renewals`                   | Admin    | Create renewal                 |
| PUT    | `/api/renewals/:id`               | Admin    | Update renewal                 |
| DELETE | `/api/renewals/:id`               | Admin    | Delete renewal                 |
| POST   | `/api/renewals/bulk`              | Admin    | Bulk create (max 500 rows)     |
| GET    | `/api/catalog-types`              | Required | List catalog types             |
| POST   | `/api/catalog-types`              | Admin    | Add custom catalog type        |
| DELETE | `/api/catalog-types/:slug`        | Admin    | Delete custom catalog type     |
| GET    | `/api/admin/smtp`                 | Admin    | Get SMTP config                |
| PUT    | `/api/admin/smtp`                 | Admin    | Save SMTP config               |
| POST   | `/api/admin/smtp/test`            | Admin    | Test SMTP connection           |
| POST   | `/api/admin/send-reminders`       | Admin    | Send email reminders           |
| GET    | `/api/admin/users`                | Admin    | List users                     |
| POST   | `/api/admin/users`                | Admin    | Create user                    |
| PUT    | `/api/admin/users/:id`            | Admin    | Update user                    |
| GET    | `/api/admin/users/:id/permissions`| Admin    | Get user catalog permissions   |
| PUT    | `/api/admin/users/:id/permissions`| Admin    | Set user catalog permissions   |

---

## Session Storage

User sessions are stored in browser `sessionStorage` under the key `clares_session`. Sessions are cleared on tab/window close or on sign-out.

---

## License

Internal use only.
