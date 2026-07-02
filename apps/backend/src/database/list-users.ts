import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    const client = await pool.connect();
    console.log('✅ Connected successfully!');
    const res = await client.query('SELECT id, email, role, tenant_id, is_active FROM users');
    console.log(res.rows);
    client.release();
  } catch (error) {
    console.error('❌ Failed:', error);
  } finally {
    await pool.end();
  }
}

run();
