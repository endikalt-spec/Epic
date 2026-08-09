// Customer reviews: what people liked about an experience (or the site in
// general). Reviews are persisted and only 'published' ones are shown.
const config = require('./config');

async function listReviews(db, { experienceId = null, limit = 12 } = {}) {
  const params = [];
  let where = "WHERE status = 'published'";
  if (experienceId === 'none') {
    where += ' AND experience_id IS NULL';
  } else if (experienceId != null) {
    params.push(Number(experienceId));
    where += ` AND experience_id = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 12, 50));
  const rows = (await db.query(
    `SELECT id, experience_id, author_name, rating, body, created_at
       FROM reviews ${where}
      ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  )).rows;
  return rows;
}

async function createReview(db, { experienceId = null, userId = null, authorName, rating, body }) {
  const name = String(authorName || '').trim().slice(0, 80);
  const text = String(body || '').trim().slice(0, 2000);
  const stars = Math.round(Number(rating));
  if (!name) return { error: 'name_required' };
  if (!text || text.length < 3) return { error: 'body_required' };
  if (!(stars >= 1 && stars <= 5)) return { error: 'rating_invalid' };

  // Moderation seam: default to published; set REVIEW_MODERATION=true to hold
  // new reviews as 'pending' until an admin approves them.
  const status = config.reviewModeration ? 'pending' : 'published';
  const row = (await db.query(
    `INSERT INTO reviews (experience_id, user_id, author_name, rating, body, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, experience_id, author_name, rating, body, status, created_at`,
    [experienceId ? Number(experienceId) : null, userId, name, stars, text, status]
  )).rows[0];
  return { review: row };
}

module.exports = { listReviews, createReview };
