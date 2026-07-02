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
    
    // Get table schemas
    const tables = ['users', 'tenants', 'warehouses', 'purchase_orders', 'approval_rules'];
    for (const table of tables) {
      console.log(`\nSchema for table: ${table}`);
      const res = await client.query(
        `SELECT column_name, data_type, is_nullable 
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [table]
      );
      console.log(res.rows);
    }

    client.release();
  } catch (error) {
    console.error('❌ Schema check failed:', error);
  } finally {
    await pool.end();
  }
}

run();
