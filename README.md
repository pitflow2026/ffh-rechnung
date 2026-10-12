# FFH Rechnungseingang

Sammelt alle Eingangsrechnungen und Mahnungen der FFH-Unternehmen direkt aus den Postfächern, liest sie per KI aus und ordnet sie dem richtigen Unternehmen zu. Die Buchhaltung filtert, öffnet die Originale, markiert „gebucht“ und lädt pro Unternehmen und Monat ein ZIP für Lexware herunter.

**Stack:** Next.js 16 · Supabase (Postgres, Auth, Storage) · Vercel (Hosting + Cron) · Microsoft Graph · Yahoo IMAP · Claude API

## So funktioniert es

1. **Abruf alle 15 Minuten** (`/api/sync`, Vercel Cron): 7 Postfächer per Microsoft Graph, Yahoo per IMAP. Übernommen werden PDF- und XML-Anhänge aus dem Posteingang. Keine Weiterleitungen nötig.
2. **Belege bilden:** XML-Rechnung und gleichnamiges PDF gehören zusammen; jedes weitere PDF ist ein eigener Beleg. ZUGFeRD wird erkannt. Originale werden unverändert im privaten Speicher abgelegt.
3. **Duplikate:** gleiche Datei (SHA-256) wird nur einmal angelegt, egal aus welchem Postfach.
4. **KI-Auslesung:** Typ (Rechnung / Mahnung / Gutschrift / Sonstiges), Rechnungsempfänger, Lieferant, Nummer, Datum, Fälligkeit, Beträge.
5. **Zuordnung:**
   - Empfänger eindeutig erkannt (≥ 80 %) → dieses Unternehmen
   - sonst Postfach gehört fest zu einem Unternehmen → dieses Unternehmen
   - sonst → **„Zu prüfen“**, die Buchhaltung ordnet per Klick zu
   - kein Buchungsbeleg (AGB, Werbung …) → **„Ignoriert“**, jederzeit wiederherstellbar
6. **Mahnungen** werden mit der gemahnten Rechnung verknüpft, sobald beide da sind.
7. Jede Änderung (gebucht, zugeordnet …) landet mit Nutzer und Zeit im Verlauf.

Unter **/postfaecher** sieht man pro Postfach, bis wann abgerufen wurde und ob es Fehler gab.

## Einrichtung

### 1. Supabase
1. Neues Projekt anlegen (Region Frankfurt).
2. SQL-Editor → Inhalt von `supabase/migrations/0001_init.sql` ausführen. Legt Tabellen, Unternehmen, Postfächer und den privaten Speicher `belege` an.
3. Zugriff freischalten:
   ```sql
   insert into allowed_users (email, name, role) values
     ('info@ffh-enterprises.com', 'Paul', 'admin'),
     ('<buchhaltung@…>', 'Buchhaltung', 'buchhaltung');
   ```
4. Authentication → URL Configuration: Site URL = App-Adresse, Redirect URL `https://<app-adresse>/auth/callback` hinzufügen.
5. Für zuverlässigen Mailversand der Anmeldelinks eigenen SMTP eintragen (Authentication → SMTP), z. B. Resend.

### 2. Microsoft Entra (Outlook-Postfächer)
1. entra.microsoft.com → App-Registrierungen → **Neue Registrierung**: Name „FFH Rechnungseingang“, nur dieser Mandant.
2. **Zertifikate & Geheimnisse** → neuen geheimen Clientschlüssel anlegen, Wert sofort kopieren.
3. Notieren: Verzeichnis-(Mandanten-)ID, Anwendungs-(Client-)ID, Schlüssel → in Vercel eintragen.
4. **Keine** Graph-Berechtigung `Mail.Read` in Entra erteilen. Der Zugriff wird stattdessen in Exchange auf die Rechnungspostfächer beschränkt:
   `docs/exchange-zugriff.ps1` ausfüllen und in PowerShell ausführen. Das Skript prüft am Ende selbst, ob nur die richtigen Postfächer erreichbar sind. Bis der Zugriff greift, können 30 Minuten bis 2 Stunden vergehen.

### 3. Yahoo
Yahoo-Konto → Kontosicherheit → **App-Passwort erstellen** → als `YAHOO_IMAP_APP_PASSWORD` eintragen.

### 4. Vercel
1. Repo importieren, alle Variablen aus `.env.example` setzen.
2. Der Cron in `vercel.json` läuft alle 15 Minuten. Das braucht einen Vercel-Pro-Plan; im Hobby-Plan sind Cron-Jobs nur täglich möglich.
3. Nach dem ersten Deploy einmal „Jetzt abrufen“ klicken oder warten. Beim ersten Lauf werden die letzten `INITIAL_SYNC_DAYS` Tage (Standard 30) geholt.

## Umstellung von der alten Weiterleitung
1. App 1–2 Wochen parallel laufen lassen. Weitergeleitete Kopien in `rechnung@` werden als Duplikate erkannt, solange die Anhänge unverändert weitergeleitet werden.
2. Stichprobe: Sind alle Rechnungen der letzten Tage im Dashboard?
3. Dann die alte Automatisierung abschalten.

## Grenzen der ersten Version
- Rechnungen, die nur als Link in der Mail stehen (ohne Anhang), werden nicht erfasst.
- Es wird nur der Posteingang gelesen. Verschieben Regeln Mails sofort in Unterordner, Ordner in der Tabelle `mailboxes` (Spalte `folder`) anpassen.
- Ausgelesene Beträge sind KI-Werte: maßgeblich bleibt beim Buchen das Original.

## Entwicklung
```bash
cp .env.example .env.local   # Werte eintragen
npm install
npm run dev
```
Abruf lokal auslösen: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync`
