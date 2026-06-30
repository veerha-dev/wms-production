-- Migration: 076_add_rejection_reason_and_created_by_to_pos.sql
-- Description: Add rejection_reason and created_by columns to purchase_orders
-- Date: 2026-06-23

ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
