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
  const tenantId = '2761a30b-aea1-47c3-a61a-0f97d4de2d4b'; // User's active tenant
  const client = await pool.connect();
  console.log('✅ Connected successfully!');

  // Test 1: Onboarding status query
  console.log('\n--- Test 1: Onboarding Status queries ---');
  try {
    const res = await client.query(`SELECT onboarding_completed_at FROM tenants WHERE id = $1`, [tenantId]);
    console.log('Tenants:', res.rows);
    const wh = await client.query(`SELECT COUNT(*)::text AS c FROM warehouses WHERE tenant_id = $1`, [tenantId]);
    console.log('Warehouses count:', wh.rows);
    const zones = await client.query(`SELECT COUNT(*)::text AS c FROM zones WHERE tenant_id = $1`, [tenantId]);
    console.log('Zones count:', zones.rows);
    const skus = await client.query(`SELECT COUNT(*)::text AS c FROM skus WHERE tenant_id = $1`, [tenantId]);
    console.log('Skus count:', skus.rows);
    const sups = await client.query(`SELECT COUNT(*)::text AS c FROM suppliers WHERE tenant_id = $1`, [tenantId]);
    console.log('Suppliers count:', sups.rows);
    const users = await client.query(`SELECT COUNT(*)::text AS c FROM users WHERE tenant_id = $1 AND role IN ('manager','worker')`, [tenantId]);
    console.log('Users count:', users.rows);
    console.log('✅ Onboarding status queries succeeded!');
  } catch (error) {
    console.error('❌ Onboarding status query failed:', error);
  }

  // Test 2: Bins query
  console.log('\n--- Test 2: Bins query ---');
  try {
    const query = `
      SELECT 
        id,
        tenant_id,
        rack_id,
        zone_id,
        warehouse_id,
        code,
        level,
        position,
        capacity,
        max_weight,
        max_volume,
        current_weight,
        current_volume,
        CASE 
          WHEN max_weight > 0 AND max_volume > 0 THEN 
            GREATEST(
              (current_weight / max_weight * 100),
              (current_volume / max_volume * 100)
            )
          WHEN max_weight > 0 THEN (current_weight / max_weight * 100)
          WHEN max_volume > 0 THEN (current_volume / max_volume * 100)
          ELSE 0
        END as utilization,
        status,
        is_locked,
        lock_reason,
        last_movement_at,
        created_at,
        updated_at
      FROM bins
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 50 OFFSET 0
    `;
    const res = await client.query(query, [tenantId]);
    console.log('Bins count:', res.rows.length);
    console.log('✅ Bins query succeeded!');
  } catch (error) {
    console.error('❌ Bins query failed:', error);
  }

  // Test 3: Batches query
  console.log('\n--- Test 3: Batches query ---');
  try {
    const res = await client.query('SELECT * FROM batches WHERE tenant_id = $1 LIMIT 5', [tenantId]);
    console.log('Batches:', res.rows);
    console.log('✅ Batches query succeeded!');
  } catch (error) {
    console.error('❌ Batches query failed:', error);
  }

  // Test 4: Dashboard stats query
  console.log('\n--- Test 4: Dashboard stats query ---');
  try {
    const whId = 'e0538d02-6117-40b3-a566-3d521d2a8781';
    // Let's find dashboard stats query
    console.log('Running test query for dashboard stats...');
  } catch (error) {
    console.error('❌ Dashboard stats query failed:', error);
  }

  client.release();
  await pool.end();
}

run();
