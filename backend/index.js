const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const db = require('./db');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Experiences
app.get('/api/experiences', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM experiences';
    let params = [];

    if (category && category !== 'all') {
      query += ' WHERE category_id = (SELECT id FROM categories WHERE slug = $1)';
      params.push(category);
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Certificate (Checkout)
app.post('/api/checkout', async (req, res) => {
  const { experienceIds } = req.body; // Array of up to 5 IDs
  if (!experienceIds || experienceIds.length === 0 || experienceIds.length > 5) {
    return res.status(400).json({ error: 'Invalid experience selection (1-5 required)' });
  }

  try {
    const code = 'EPIC-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    // Start transaction
    await db.query('BEGIN');

    const certResult = await db.query(
      'INSERT INTO certificates (code) VALUES ($1) RETURNING id',
      [code]
    );
    const certId = certResult.rows[0].id;

    for (const expId of experienceIds) {
      await db.query(
        'INSERT INTO certificate_options (certificate_id, experience_id) VALUES ($1, $2)',
        [certId, expId]
      );
    }

    await db.query('COMMIT');
    res.json({ success: true, code });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Activate Certificate
app.post('/api/activate', async (req, res) => {
  const { code } = req.body;
  try {
    const result = await db.query(
      'SELECT c.*, json_agg(e.*) as options FROM certificates c JOIN certificate_options co ON c.id = co.certificate_id JOIN experiences e ON co.experience_id = e.id WHERE c.code = $1 GROUP BY c.id',
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Redeem (Select final experience)
app.post('/api/redeem', async (req, res) => {
  const { code, experienceId } = req.body;
  try {
    // Verify experience is one of the options
    const verify = await db.query(
      'SELECT 1 FROM certificate_options co JOIN certificates c ON co.certificate_id = c.id WHERE c.code = $1 AND co.experience_id = $2',
      [code, experienceId]
    );

    if (verify.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid experience for this certificate' });
    }

    await db.query(
      'UPDATE certificates SET status = $1, redeemed_at = CURRENT_TIMESTAMP, selected_experience_id = $2 WHERE code = $3',
      ['redeemed', experienceId, code]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Redeem failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
