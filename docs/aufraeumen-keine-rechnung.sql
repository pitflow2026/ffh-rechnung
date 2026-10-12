-- Einmaliges Aufräumen: bereits importierte Belege ohne Rechnungsbezug
-- auf "ignoriert" setzen. Nichts wird gelöscht – im Dashboard unter
-- Status "Ignoriert" bleibt alles sichtbar und kann wiederhergestellt werden.
-- Betroffen sind nur offene / zu prüfende Belege ohne E-Rechnung,
-- bei denen weder Betreff noch Dateiname nach Rechnung/Mahnung aussieht.

-- 1. Vorschau: Was würde ignoriert?
select d.id, d.supplier, e.subject, string_agg(f.filename, ', ') as dateien
from documents d
join emails e on e.id = d.email_id
left join document_files f on f.document_id = d.id
where d.status in ('offen', 'pruefen')
  and d.einvoice_format is null
group by d.id, d.supplier, e.subject
having not (
  coalesce(e.subject, '') || ' ' || coalesce(string_agg(f.filename, ' '), '')
  ~* '(rechnung|invoice|faktura|billing|receipt|quittung|gutschrift|storno|credit ?note|credit memo|mahnung|zahlungserinnerung|zahlungsaufforderung|offene[rn]? (posten|betrag)|payment reminder|dunning|overdue|past due|payment due|amount due|\mbill\M|\mbeleg(e|nr)?\M|\mre[-. ]?nr|\mrg[-. ]?nr|\minv[-_]?[0-9])'
);

-- 2. Wenn die Vorschau passt: ausführen
update documents set status = 'ignoriert', ai_note = coalesce(ai_note, '') || ' · per Aufräumen ignoriert', updated_at = now()
where id in (
  select d.id
  from documents d
  join emails e on e.id = d.email_id
  left join document_files f on f.document_id = d.id
  where d.status in ('offen', 'pruefen')
    and d.einvoice_format is null
  group by d.id, e.subject
  having not (
    coalesce(e.subject, '') || ' ' || coalesce(string_agg(f.filename, ' '), '')
    ~* '(rechnung|invoice|faktura|billing|receipt|quittung|gutschrift|storno|credit ?note|credit memo|mahnung|zahlungserinnerung|zahlungsaufforderung|offene[rn]? (posten|betrag)|payment reminder|dunning|overdue|past due|payment due|amount due|\mbill\M|\mbeleg(e|nr)?\M|\mre[-. ]?nr|\mrg[-. ]?nr|\minv[-_]?[0-9])'
  )
);
