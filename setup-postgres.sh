#!/bin/bash

echo "🔧 Setting up PostgreSQL for Veerha WMS..."
echo ""

# Set simple password for PostgreSQL user
PASSWORD="veerha123"

# Create PostgreSQL user and database using SQL commands
echo "📝 Creating database and user..."

# Find psql: prefer whatever is on PATH, fall back to the Homebrew keg
if command -v psql > /dev/null 2>&1; then
  PSQL="psql"
elif [ -x /opt/homebrew/opt/postgresql@16/bin/psql ]; then
  PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"
else
  echo "❌ psql not found. Install PostgreSQL (e.g. brew install postgresql@16) or use Docker instead:"
  echo "   docker compose up -d postgres"
  exit 1
fi

# Use psql with peer authentication (works for system user)
"$PSQL" -d postgres << EOF
-- Create database
CREATE DATABASE veerha_wms_dev;

-- Create user with password
CREATE USER veerha WITH PASSWORD '$PASSWORD';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE veerha_wms_dev TO veerha;

-- Connect to the database and grant schema privileges
\c veerha_wms_dev
GRANT ALL ON SCHEMA public TO veerha;

-- Show success
\l
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ PostgreSQL setup complete!"
  echo ""
  echo "📝 Database connection details:"
  echo "   Database: veerha_wms_dev"
  echo "   User: veerha"
  echo "   Password: $PASSWORD"
  echo "   Connection string: postgresql://veerha:$PASSWORD@localhost:5432/veerha_wms_dev"
  echo ""
  echo "Next steps:"
  echo "1. Connection string is already in apps/backend/.env"
  echo "2. Run: cd apps/backend && npm run migrate"
  echo "3. Run: npm run start:dev"
else
  echo ""
  echo "❌ Setup failed. Trying alternative method..."
  echo ""
  echo "Please run these commands manually:"
  echo "  psql postgres"
  echo "  CREATE DATABASE veerha_wms_dev;"
  echo "  CREATE USER veerha WITH PASSWORD 'veerha123';"
  echo "  GRANT ALL PRIVILEGES ON DATABASE veerha_wms_dev TO veerha;"
fi
