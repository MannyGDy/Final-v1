const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const { pool, query, dbSchema } = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('admin_login', { title: 'Admin Login' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  if (username === adminUser && password === adminPass) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  req.flash('error', 'Invalid admin credentials');
  return res.redirect('/admin/login');
});

router.get('/logout', (req, res) => {
  req.session.isAdmin = false;
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', ensureAdmin, async (req, res) => {
  const { rows: users } = await query(
    `SELECT id, full_name, company, email, phone, created_at FROM ${dbSchema}.portal_users ORDER BY created_at DESC`
  );
  res.render('admin_dashboard', { title: 'Admin Dashboard', users });
});

router.get('/users.csv', ensureAdmin, async (req, res) => {
  const { rows } = await query(
    `SELECT full_name, company, email, phone, created_at FROM ${dbSchema}.portal_users ORDER BY created_at DESC`
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  const header = 'Full Name,Company,Email,Phone,Created At\n';
  const data = rows
    .map((r) =>
      [r.full_name, r.company, r.email, r.phone, r.created_at.toISOString()]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(',')
    )
    .join('\n');
  res.send(header + data + '\n');
});

router.get('/stats', ensureAdmin, async (req, res) => {
  const { start, end, sort = 'last_login', dir = 'desc' } = req.query;

  const where = [];
  const params = [];
  if (start) {
    params.push(start);
    where.push(`acctstarttime >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    where.push(`acctstarttime <= $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortCols = {
    username: 'username',
    sessions: 'sessions',
    last_login: 'last_login',
    total_time: 'total_time',
    input_octets: 'input_octets',
    output_octets: 'output_octets',
  };
  const sortCol = sortCols[sort] || 'last_login';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const perUserSql = `
    SELECT username,
           COUNT(*) AS sessions,
           MAX(acctstarttime) AS last_login,
           COALESCE(SUM(acctsessiontime),0) AS total_time,
           COALESCE(SUM(acctinputoctets),0) AS input_octets,
           COALESCE(SUM(acctoutputoctets),0) AS output_octets
    FROM ${dbSchema}.radacct
    ${whereSql}
    GROUP BY username
    ORDER BY ${sortCol} ${sortDir}
    LIMIT 500
  `;

  const totalUsersSql = `SELECT COUNT(*)::int AS total_users FROM ${dbSchema}.portal_users`;
  const activeUsersSql = `SELECT COUNT(DISTINCT username)::int AS active_users_24h FROM ${dbSchema}.radacct WHERE acctstarttime > NOW() - INTERVAL '24 hours'`;
  const totalDataSql = `SELECT (COALESCE(SUM(acctinputoctets),0) + COALESCE(SUM(acctoutputoctets),0))::bigint AS total_octets FROM ${dbSchema}.radacct`;

  const client = await pool.connect();
  try {
    const [{ rows: perUser }, { rows: totalUsers }, { rows: activeUsers }, { rows: totalData }] = await Promise.all([
      client.query(perUserSql, params),
      client.query(totalUsersSql),
      client.query(activeUsersSql),
      client.query(totalDataSql),
    ]);

    const totals = {
      totalUsers: totalUsers[0]?.total_users || 0,
      activeUsers24h: activeUsers[0]?.active_users_24h || 0,
      totalOctets: totalData[0]?.total_octets || 0,
    };

    res.render('stats', {
      title: 'Statistics',
      perUser,
      totals,
      filters: { start, end, sort: sortCol, dir: sortDir },
    });
  } finally {
    client.release();
  }
});

router.get('/stats.csv', ensureAdmin, async (req, res) => {
  const { start, end } = req.query;
  const where = [];
  const params = [];
  if (start) {
    params.push(start);
    where.push(`acctstarttime >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    where.push(`acctstarttime <= $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT username,
           COUNT(*) AS sessions,
           MAX(acctstarttime) AS last_login,
           COALESCE(SUM(acctsessiontime),0) AS total_time,
           COALESCE(SUM(acctinputoctets),0) AS input_octets,
           COALESCE(SUM(acctoutputoctets),0) AS output_octets
    FROM ${dbSchema}.radacct
    ${whereSql}
    GROUP BY username
    ORDER BY last_login DESC
    LIMIT 500
  `;

  const { rows } = await query(sql, params);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="stats.csv"');
  const header = 'Username,Sessions,Last Login,Total Time (s),Input Octets,Output Octets\n';
  const data = rows
    .map((r) =>
      [
        r.username,
        r.sessions,
        r.last_login ? new Date(r.last_login).toISOString() : '',
        r.total_time,
        r.input_octets,
        r.output_octets,
      ]
        .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
        .join(',')
    )
    .join('\n');
  res.send(header + data + '\n');
});

module.exports = router;


