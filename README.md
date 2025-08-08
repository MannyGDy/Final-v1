Captive Portal Web Application (FreeRADIUS + PostgreSQL)

Requirements
- Ubuntu/Debian with Node.js >= 18 and npm
- FreeRADIUS and PostgreSQL already installed and configured

Setup (Linux)
1) Install Node.js and npm (if not present):
   sudo apt update && sudo apt install -y nodejs npm

2) Clone or copy this project to your server and cd into it.

3) Create environment file and configure database and admin credentials:
   cp .env.example .env
   nano .env

4) Install dependencies:
   npm install

5) Start the app:
   npm run start

By default the app listens on PORT from .env (default 3000) on HOST 0.0.0.0.

Database Integration
- Uses the FreeRADIUS PostgreSQL database.
- Inserts user credentials into radcheck with attribute Cleartext-Password.
- Reads accounting statistics from radacct.
- Also maintains a portal_users table for profile data (auto-created on startup).

Folder Structure
- server.js: App bootstrap
- src/db.js: PostgreSQL connection and setup
- src/routes/: Public and admin routes
- src/middleware/: Auth middleware
- views/: EJS templates
- public/: Static assets

Deployment
- Use a process manager (e.g., systemd or pm2) and a reverse proxy (e.g., Nginx) as needed.


