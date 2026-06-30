-- Migration: 075_create_approval_rules.sql
-- Description: Create approval_rules table for threshold based approvals
-- Date: 2026-06-23

CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module TEXT NOT NULL, -- 'purchase_orders', etc.
  threshold_amount NUMERIC(12,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, module)
);

CREATE INDEX IF NOT EXISTS idx_approval_rules_tenant_id ON approval_rules(tenant_id);
