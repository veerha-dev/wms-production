import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase');

console.log('Connecting to database:', dbUrl.split('@')[1] || dbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    const client = await pool.connect();
    console.log('✅ Connected successfully!');
    
    // Check zones table
    console.log('Querying zones...');
    const zonesRes = await client.query('SELECT * FROM zones LIMIT 5');
    console.log(`✅ Zones query success: ${zonesRes.rows.length} rows found`);
    console.log(zonesRes.rows);

    // Check purchase_orders table
    console.log('Querying purchase_orders...');
    const poRes = await client.query('SELECT * FROM purchase_orders LIMIT 5');
    console.log(`✅ PO query success: ${poRes.rows.length} rows found`);
    console.log(poRes.rows);

    // Check approval_rules table
    console.log('Querying approval_rules...');
    const rulesRes = await client.query('SELECT * FROM approval_rules LIMIT 5');
    console.log(`✅ Approval rules query success: ${rulesRes.rows.length} rows found`);
    console.log(rulesRes.rows);

    client.release();
  } catch (error) {
    console.error('❌ Query failed:', error);
  } finally {
    await pool.end();
  }
}

run();
