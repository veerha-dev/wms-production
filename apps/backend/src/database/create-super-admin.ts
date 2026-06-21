import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function createSuperAdmin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔄 Checking if superadmin user exists...');

    const checkResult = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND is_super_admin = true',
      ['superadmin@veerha.com']
    );

    if (checkResult.rows.length > 0) {
      console.log('✅ Superadmin user already exists.');
      return;
    }

    console.log('➕ Creating superadmin user...');
    // Bcrypt hash for 'superadmin123'
    const passwordHash = '$2b$10$lDMnJE8vehMCt2doZ.IYXugp9QSTc/THvcf3HFKp6AmZMyt3l/eB.';
    const defaultTenantId = '00000000-0000-0000-0000-000000000001';

    await pool.query(
      `INSERT INTO users (
        tenant_id, email, password_hash, full_name, role, is_active, is_super_admin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [defaultTenantId, 'superadmin@veerha.com', passwordHash, 'Super Admin', 'admin', true, true]
    );

    console.log('✅ Superadmin user created successfully!');
    console.log('   Email: superadmin@veerha.com');
    console.log('   Password: superadmin123');

  } catch (error) {
    console.error('❌ Error creating superadmin user:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createSuperAdmin();
