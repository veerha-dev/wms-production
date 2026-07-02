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
  const client = await pool.connect();
  try {
    console.log('Testing limit with string value...');
    await client.query('SELECT * FROM bins LIMIT $1 OFFSET $2', ['5000', 0]);
    console.log('✅ String limit worked!');
  } catch (err: any) {
    console.error('❌ String limit failed:', err.message);
  }

  try {
    console.log('Testing offset with string value...');
    await client.query('SELECT * FROM bins LIMIT $1 OFFSET $2', [5000, '0']);
    console.log('✅ String offset worked!');
  } catch (err: any) {
    console.error('❌ String offset failed:', err.message);
  }

  client.release();
  await pool.end();
}

run();
