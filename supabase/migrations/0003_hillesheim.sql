-- fit@Hillesheim UG mit eigenem Outlook-Postfach (Abruf ab 1. Juli für Q3)
insert into companies (id, name, hints, sort) values
  ('hill', 'fit@Hillesheim UG', 'fit@Hillesheim, Hillesheim', 7)
on conflict (id) do nothing;

insert into mailboxes (address, provider, default_company_id, synced_until) values
  ('hillesheim@ffh-enterprises.com', 'graph', 'hill', '2026-07-01T00:00:00+02:00')
on conflict (address) do nothing;
