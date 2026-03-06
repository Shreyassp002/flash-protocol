-- Migration: Change chain ID columns from integer to varchar
-- This allows non-numeric chain keys like 'solana' to be stored.
-- Existing numeric values (e.g. 42161) are cast to their string representation.

ALTER TABLE payment_links
  ALTER COLUMN receive_chain_id TYPE varchar
  USING receive_chain_id::varchar;

ALTER TABLE transactions
  ALTER COLUMN from_chain_id TYPE varchar
  USING from_chain_id::varchar;

ALTER TABLE transactions
  ALTER COLUMN to_chain_id TYPE varchar
  USING to_chain_id::varchar;

ALTER TABLE quotes
  ALTER COLUMN from_chain_id TYPE varchar
  USING from_chain_id::varchar;

ALTER TABLE quotes
  ALTER COLUMN to_chain_id TYPE varchar
  USING to_chain_id::varchar;

ALTER TABLE merchants
  ALTER COLUMN default_receive_chain TYPE varchar
  USING default_receive_chain::varchar;

ALTER TABLE analytics
  ALTER COLUMN chain_id TYPE varchar
  USING chain_id::varchar;
