-- ==========================================
-- WEBHOOK SYSTEM
-- ==========================================

-- Webhook endpoints registered by merchants
create table if not exists webhook_endpoints (
    id uuid primary key default uuid_generate_v4(),
    merchant_id uuid references merchants(id) not null,
    url text not null,
    description varchar(255),
    secret varchar(128) not null,
    events text[] not null default '{}',
    active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),

    unique(merchant_id, url)
);

-- RLS: anon/authenticated can read own endpoints; all writes via service role (which bypasses RLS)
alter table webhook_endpoints enable row level security;
create policy "webhook_endpoints_select" on webhook_endpoints for select using (
  merchant_id in (select id from merchants where wallet_address = auth.jwt()->>'sub')
);
create policy "webhook_endpoints_service_write" on webhook_endpoints for all using (false); -- Service role only

-- Indexes
create index if not exists idx_webhook_endpoints_merchant on webhook_endpoints(merchant_id);
create index if not exists idx_webhook_endpoints_active on webhook_endpoints(merchant_id, active) where active = true;

-- Comments
comment on table webhook_endpoints is 'Merchant-registered webhook URLs for event delivery';
comment on column webhook_endpoints.secret is 'HMAC-SHA256 signing secret (whsec_ prefixed, hex-encoded)';
comment on column webhook_endpoints.events is 'Array of subscribed event types (e.g. payment.completed, payment.failed)';

-- Webhook delivery log
create table if not exists webhook_deliveries (
    id uuid primary key default uuid_generate_v4(),
    webhook_endpoint_id uuid references webhook_endpoints(id) on delete cascade not null,
    event_type varchar(50) not null,
    payload jsonb not null,
    response_status integer,
    response_body text,
    error_message text,
    attempt integer default 1,
    delivered boolean default false,
    duration_ms integer,
    created_at timestamp with time zone default now()
);

-- RLS: anon/authenticated can read deliveries for own endpoints; all writes via service role
alter table webhook_deliveries enable row level security;
create policy "webhook_deliveries_select" on webhook_deliveries for select using (
  webhook_endpoint_id in (
    select id from webhook_endpoints where merchant_id in (
      select id from merchants where wallet_address = auth.jwt()->>'sub'
    )
  )
);
create policy "webhook_deliveries_service_write" on webhook_deliveries for all using (false); -- Service role only

-- Indexes
create index if not exists idx_webhook_deliveries_endpoint on webhook_deliveries(webhook_endpoint_id);
create index if not exists idx_webhook_deliveries_event on webhook_deliveries(event_type);
create index if not exists idx_webhook_deliveries_created on webhook_deliveries(created_at desc);
create index if not exists idx_webhook_deliveries_failed on webhook_deliveries(delivered) where delivered = false;

-- Comments
comment on table webhook_deliveries is 'Log of webhook delivery attempts (auto-cleaned after 30 days)';

-- Auto-cleanup function (matches api_logs pattern)
create or replace function delete_old_webhook_deliveries()
returns void
language plpgsql
security definer
as $$
begin
    delete from webhook_deliveries
    where created_at < now() - interval '30 days';
end;
$$;
