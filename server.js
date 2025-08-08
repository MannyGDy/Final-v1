const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();

const { ensurePortalUsersTable } = require('./src/db');

const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// View engine and static assets
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(flash());

// Expose flash and session to templates
app.use((req, res, next) => {
  res.locals.flash = {
    error: req.flash('error'),
    success: req.flash('success'),
  };
  res.locals.session = req.session || {};
  next();
});

// Routes
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Start server after ensuring the portal_users table exists
ensurePortalUsersTable()
  .then(() => {
    app.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });


