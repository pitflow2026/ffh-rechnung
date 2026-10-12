-- Beliebige IMAP-Postfächer (Yahoo, ALL-INKL …) mit eigenem Server und Zugang.
-- Passwörter liegen NICHT in der Datenbank: imap_password_env nennt die
-- Vercel-Umgebungsvariable, in der das Passwort steht.

alter table mailboxes
  add column if not exists imap_host         text,
  add column if not exists imap_port         int not null default 993,
  add column if not exists imap_user         text,
  add column if not exists imap_password_env text;

-- Yahoo auf das neue Schema umstellen (bisherige Variablen bleiben gültig)
update mailboxes
set imap_host = 'imap.mail.yahoo.com',
    imap_user = address,
    imap_password_env = 'YAHOO_IMAP_APP_PASSWORD'
where provider = 'imap' and address = 'froese.fitnessstudios@yahoo.com';

-- ALL-INKL-Postfächer der Studios.
-- <SERVER> ersetzen: steht im KAS unter E-Mail → Postfach → Details,
-- z. B. w0123456.kasserver.com. Benutzer ist meist die Postfach-Kennung
-- (m0…) oder die E-Mail-Adresse selbst – siehe ebenfalls die Details.
-- synced_until = 1. Juli, damit auch Q3 vollständig abgerufen wird
insert into mailboxes (address, provider, default_company_id, imap_host, imap_user, imap_password_env, synced_until) values
  ('hamm@fitplus-club.de',         'imap', 'hamm', '<SERVER>', 'hamm@fitplus-club.de',         'IMAP_PW_FITPLUS_HAMM', '2026-07-01T00:00:00+02:00'),
  ('adenau@fitplus-club.de',       'imap', 'ring', '<SERVER>', 'adenau@fitplus-club.de',       'IMAP_PW_FITPLUS_ADENAU', '2026-07-01T00:00:00+02:00'),
  ('daun@fitplus-club.de',         'imap', 'daun', '<SERVER>', 'daun@fitplus-club.de',         'IMAP_PW_FITPLUS_DAUN', '2026-07-01T00:00:00+02:00'),
  ('emmelshausen@fitplus-club.de', 'imap', 'emm',  '<SERVER>', 'emmelshausen@fitplus-club.de', 'IMAP_PW_FITPLUS_EMMELSHAUSEN', '2026-07-01T00:00:00+02:00')
on conflict (address) do nothing;
