const express = require('express');
const crypto = require('crypto');
const { pool, query, dbSchema } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { title: 'Captive Portal' });
});

router.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign Up' });
});

router.post('/signup', async (req, res) => {
  const { fullName, company, email, phone } = req.body;

  if (!fullName || !company || !email || !phone) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/signup');
  }

  const client = await pool.connect();
  try {
    // Check uniqueness in portal_users
    const existingPortal = await client.query(
      `SELECT 1 FROM ${dbSchema}.portal_users WHERE email = $1 OR phone = $2 LIMIT 1`,
      [email, phone]
    );
    if (existingPortal.rowCount > 0) {
      req.flash('error', 'Email or phone already registered.');
      return res.redirect('/signup');
    }

    // Check uniqueness of username in radcheck
    const existingRad = await client.query(
      `SELECT 1 FROM ${dbSchema}.radcheck WHERE username = $1 LIMIT 1`,
      [email]
    );
    if (existingRad.rowCount > 0) {
      req.flash('error', 'Email already exists in RADIUS.');
      return res.redirect('/signup');
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO ${dbSchema}.portal_users (full_name, company, email, phone) VALUES ($1, $2, $3, $4)`,
      [fullName, company, email, phone]
    );

    await client.query(
      `INSERT INTO ${dbSchema}.radcheck (username, attribute, op, value) VALUES ($1, 'Cleartext-Password', ':=', $2)`,
      [email, phone]
    );

    await client.query('COMMIT');
    req.flash('success', 'Registration successful. You can now sign in.');
    return res.redirect('/signin');
  } catch (err) {
    await client.query('ROLLBACK');
    // eslint-disable-next-line no-console
    console.error('Signup error:', err);
    req.flash('error', 'Registration failed.');
    return res.redirect('/signup');
  } finally {
    client.release();
  }
});

router.get('/signin', (req, res) => {
  const mt = {
    linkLoginOnly: req.query['link-login-only'] || req.query.linkLoginOnly || '',
    dst: req.query.dst || '',
    popup: req.query.popup || '',
    chapId: req.query['chap-id'] || req.query.chapId || '',
    chapChallenge: req.query['chap-challenge'] || req.query.chapChallenge || '',
  };
  res.render('signin', { title: 'Sign In', mt });
});

router.post('/signin', async (req, res) => {
  const { email, phone } = req.body;
  const linkLoginOnly = req.body.linkLoginOnly || '';
  const dst = req.body.dst || '';
  const popup = req.body.popup || '';
  const chapId = req.body.chapId || '';
  const chapChallenge = req.body.chapChallenge || '';
  if (!email || !phone) {
    req.flash('error', 'Email and phone are required.');
    return res.redirect('/signin');
  }
  try {
    const result = await query(
      `SELECT value FROM ${dbSchema}.radcheck WHERE username = $1 AND attribute = 'Cleartext-Password' LIMIT 1`,
      [email]
    );
    if (result.rowCount === 0) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/signin');
    }
    const storedPassword = result.rows[0].value;
    if (storedPassword !== phone) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/signin');
    }
    // If MikroTik login URL is provided, hand off to router to grant access
    if (linkLoginOnly) {
      let chapMd5 = '';
      if (chapId && chapChallenge) {
        try {
          const buf = Buffer.concat([
            Buffer.from(chapId, 'hex'),
            Buffer.from(phone, 'utf8'),
            Buffer.from(chapChallenge, 'hex'),
          ]);
          chapMd5 = crypto.createHash('md5').update(buf).digest('hex');
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('CHAP MD5 generation failed, falling back to PAP:', e);
        }
      }
      return res.render('mt_handoff', {
        title: 'Authorizing...',
        linkLoginOnly,
        email,
        phone,
        dst,
        popup,
        chapId,
        chapChallenge,
        chapMd5,
      });
    }
    return res.redirect('/success');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Signin error:', err);
    req.flash('error', 'Authentication failed.');
    return res.redirect('/signin');
  }
});

router.get('/success', (req, res) => {
  res.render('success', { title: 'Access Granted' });
});

module.exports = router;


