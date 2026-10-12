-- FFH Rechnungseingang – Grundschema
-- Alle Tabellen haben RLS aktiv und KEINE Policies: Zugriff nur serverseitig
-- über den Service-Role-Key, nachdem die App den Nutzer geprüft hat.

create extension if not exists pgcrypto;

-- Unternehmen ---------------------------------------------------------------
create table companies (
  id          text primary key,
  name        text not null,
  -- Zusätzliche Begriffe, an denen die KI das Unternehmen erkennt
  -- (Anschriften, Kurzformen, Kundennummern …)
  hints       text not null default '',
  sort        int  not null default 0
);

insert into companies (id, name, hints, sort) values
  ('ffh',    'FFH Enterprises GmbH',   'FFH Enterprises, FFH Capital', 1),
  ('hamm',   'fit@Hamm GmbH',          'fit@Hamm, Hamm (Sieg)', 2),
  ('ring',   'fit@Ring GmbH',          'fit@Ring, Adenau, Nürburgring', 3),
  ('daun',   'fit@Daun GmbH',          'fit@Daun, Daun', 4),
  ('emm',    'fit@Emmelshausen GmbH',  'fit@Emmelshausen, Emmelshausen', 5),
  ('froese', 'Froese Immobilien eGbR', 'Froese Immobilien', 6);

-- Postfächer ----------------------------------------------------------------
create table mailboxes (
  id                 uuid primary key default gen_random_uuid(),
  address            text not null unique,
  provider           text not null check (provider in ('graph', 'imap')),
  -- Wenn gesetzt: Unternehmen, zu dem dieses Postfach normalerweise gehört.
  -- Leer bei Sammelpostfächern (info@, rechnung@, Yahoo).
  default_company_id text references companies(id),
  folder             text not null default 'inbox',
  active             boolean not null default true,
  synced_until       timestamptz,          -- Zeitstempel der zuletzt verarbeiteten Mail
  imap_uidvalidity   bigint,
  imap_last_uid      bigint,
  last_run_at        timestamptz,
  last_error         text,
  last_error_at      timestamptz
);

insert into mailboxes (address, provider, default_company_id) values
  ('info@ffh-enterprises.com',         'graph', null),
  ('rechnung@ffh-enterprises.com',     'graph', null),
  ('hamm@ffh-enterprises.com',         'graph', 'hamm'),
  ('adenau@ffh-enterprises.com',       'graph', 'ring'),
  ('daun@ffh-enterprises.com',         'graph', 'daun'),
  ('emmelshausen@ffh-enterprises.com', 'graph', 'emm'),
  ('immobilien@ffh-enterprises.com',   'graph', 'froese'),
  ('froese.fitnessstudios@yahoo.com',  'imap',  null);

-- Mails ---------------------------------------------------------------------
create table emails (
  id                  uuid primary key default gen_random_uuid(),
  mailbox_id          uuid not null references mailboxes(id),
  provider_message_id text not null,
  internet_message_id text,
  from_address        text,
  from_name           text,
  subject             text,
  received_at         timestamptz not null,
  created_at          timestamptz not null default now(),
  unique (mailbox_id, provider_message_id)
);
create index emails_internet_message_id_idx on emails (internet_message_id);

-- Belege (Rechnung, Mahnung, Gutschrift …) ----------------------------------
create table documents (
  id                   uuid primary key default gen_random_uuid(),
  email_id             uuid not null references emails(id),
  mailbox_id           uuid not null references mailboxes(id),
  received_at          timestamptz not null,
  company_id           text references companies(id),
  doc_type             text not null default 'rechnung'
                         check (doc_type in ('rechnung', 'mahnung', 'gutschrift', 'sonstiges')),
  status               text not null default 'pruefen'
                         check (status in ('offen', 'gebucht', 'pruefen', 'ignoriert')),
  supplier             text,
  invoice_number       text,
  invoice_date         date,
  due_date             date,
  net                  numeric(12, 2),
  vat                  numeric(12, 2),
  gross                numeric(12, 2),
  currency             text not null default 'EUR',
  einvoice_format      text check (einvoice_format in ('xrechnung', 'zugferd')),
  confidence           numeric(4, 3),
  ai_note              text,
  reference_number     text,                 -- bei Mahnungen: gemahnte Rechnungsnr.
  related_document_id  uuid references documents(id),
  content_hash         text not null,
  extraction           jsonb,
  extraction_error     text,
  booked_at            timestamptz,
  booked_by            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index documents_content_hash_idx on documents (content_hash);
create index documents_company_idx on documents (company_id, status);
create index documents_received_idx on documents (received_at desc);
create index documents_mailbox_idx on documents (mailbox_id);
create index documents_invoice_number_idx on documents (invoice_number);

create table document_files (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  filename      text not null,
  content_type  text not null,
  storage_path  text not null,
  size          int  not null,
  sha256        text not null,
  created_at    timestamptz not null default now()
);
create index document_files_document_idx on document_files (document_id);

-- Wer darf rein --------------------------------------------------------------
create table allowed_users (
  email  text primary key,
  name   text,
  role   text not null default 'buchhaltung' check (role in ('admin', 'buchhaltung'))
);

-- Protokoll: wer hat wann was geändert ---------------------------------------
create table audit_log (
  id           bigint generated always as identity primary key,
  document_id  uuid references documents(id) on delete set null,
  user_email   text,
  action       text not null,
  details      jsonb,
  at           timestamptz not null default now()
);
create index audit_log_document_idx on audit_log (document_id, at desc);

-- RLS: an, ohne Policies (nur Service-Role) ------------------------------------
alter table companies       enable row level security;
alter table mailboxes       enable row level security;
alter table emails          enable row level security;
alter table documents       enable row level security;
alter table document_files  enable row level security;
alter table allowed_users   enable row level security;
alter table audit_log       enable row level security;

-- Privater Speicher für die Originaldateien -----------------------------------
insert into storage.buckets (id, name, public)
values ('belege', 'belege', false)
on conflict (id) do nothing;
