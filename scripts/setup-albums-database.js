require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'jubileeverse',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'jubilee2026',
  ssl: false
});

async function setupDatabase() {
  try {
    console.log('Setting up albums table...\n');

    // Create albums table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS albums (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        category_id INT REFERENCES categories(id) ON DELETE CASCADE,
        persona_slug VARCHAR(100),
        theme_slug VARCHAR(100),
        sort_order INT DEFAULT 0,
        release_date DATE,
        status VARCHAR(50) DEFAULT 'concept',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✓ Albums table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_albums_category_id ON albums(category_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_albums_persona_slug ON albums(persona_slug)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_albums_theme_slug ON albums(theme_slug)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_albums_status ON albums(status)
    `);

    console.log('✓ Indexes created\n');

    // Check if we already have albums
    const count = await pool.query('SELECT COUNT(*) FROM albums');
    console.log(`Current album count: ${count.rows[0].count}\n`);

    console.log('✓ Albums database setup complete!\n');

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

setupDatabase();
