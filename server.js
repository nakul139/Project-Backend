const express = require('express');
const cors = require('cors'); // Import the cors package
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

// Initialize Express app
const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Initialize SQLite database
const db = new sqlite3.Database('./database.db');

// Middleware to validate and set default month
const validateMonth = (req, res, next) => {
  let { month } = req.query;

  // If month is not provided or invalid, default to March ('03')
  if (!month || typeof month !== 'string' || month.length > 2 || isNaN(month)) {
    month = '03';
  }

  // Ensure month is always 2 digits (e.g., '01' for January)
  req.month = String(month).padStart(2, '0');
  next();
};

// Rest of your backend code...

// Create table and seed data
db.serialize(() => {
  db.run(`DROP TABLE IF EXISTS transactions`);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      title TEXT,
      description TEXT,
      price REAL,
      dateOfSale TEXT,
      sold BOOLEAN,
      category TEXT
    )
  `);

  axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json')
    .then(response => {
      const stmt = db.prepare(`
        INSERT INTO transactions (title, description, price, dateOfSale, sold, category)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      response.data.forEach(item => {
        stmt.run(item.title, item.description, item.price, item.dateOfSale, item.sold, item.category);
      });
      stmt.finalize();
    })
    .catch(err => {
      console.error('Error seeding database:', err);
    });
});

// Middleware to parse JSON
app.use(express.json());

// API to list all transactions with search and pagination
app.get('/transactions', validateMonth, (req, res) => {
  const { month } = req; // Use validated month
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM transactions WHERE strftime('%m', dateOfSale) = ?";
  let params = [month];

  if (search) {
    query += " AND (title LIKE ? OR description LIKE ? OR price LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API for statistics
app.get('/statistics', validateMonth, (req, res) => {
  const { month } = req; // Use validated month

  db.get(`
    SELECT
      SUM(price) AS totalSaleAmount,
      COUNT(CASE WHEN sold = 1 THEN 1 END) AS totalSoldItems,
      COUNT(CASE WHEN sold = 0 THEN 1 END) AS totalNotSoldItems
    FROM transactions
    WHERE strftime('%m', dateOfSale) = ?
  `, [month], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row);
  });
});

// API for bar chart
app.get('/bar-chart', validateMonth, (req, res) => {
  const { month } = req; // Use validated month

  const priceRanges = [
    { range: '0 - 100', min: 0, max: 100 },
    { range: '101 - 200', min: 101, max: 200 },
    { range: '201 - 300', min: 201, max: 300 },
    { range: '301 - 400', min: 301, max: 400 },
    { range: '401 - 500', min: 401, max: 500 },
    { range: '501 - 600', min: 501, max: 600 },
    { range: '601 - 700', min: 601, max: 700 },
    { range: '701 - 800', min: 701, max: 800 },
    { range: '801 - 900', min: 801, max: 900 },
    { range: '901 - above', min: 901, max: Infinity }
  ];

  const promises = priceRanges.map(range => {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) AS count
        FROM transactions
        WHERE strftime('%m', dateOfSale) = ? AND price >= ? AND price <= ?
      `, [month, range.min, range.max], (err, row) => {
        if (err) reject(err);
        else resolve({ range: range.range, count: row.count });
      });
    });
  });

  Promise.all(promises)
    .then(results => res.json(results))
    .catch(err => res.status(500).json({ error: err.message }));
});

// API for pie chart
app.get('/pie-chart', validateMonth, (req, res) => {
  const { month } = req; // Use validated month

  db.all(`
    SELECT category, COUNT(*) AS count
    FROM transactions
    WHERE strftime('%m', dateOfSale) = ?
    GROUP BY category
  `, [month], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});