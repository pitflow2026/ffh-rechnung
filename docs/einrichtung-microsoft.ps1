# ---------------------------------------------------------------------------
# FFH Rechnungseingang – komplette Microsoft-Einrichtung in einem Durchgang
#
# Was das Skript macht:
#   1. legt in Entra die App "FFH Rechnungseingang" an (oder nimmt die vorhandene)
#   2. erzeugt einen geheimen Schlüssel (24 Monate gültig)
#   3. gibt der App in Exchange Online Leserecht NUR auf die Rechnungspostfächer
#   4. prüft das und zeigt am Ende die drei Werte für Vercel an
#
# Ausführen: PowerShell öffnen, gesamten Inhalt einfügen, Enter.
# Es öffnen sich nacheinander zwei Microsoft-Logins: beide Male mit einem
# Admin-Konto von ffh-enterprises.com anmelden und die Rückfrage bestätigen.
# ---------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
$AppName = "FFH Rechnungseingang"
$Mailboxes = @(
  "info@ffh-enterprises.com",
  "rechnung@ffh-enterprises.com",
  "hamm@ffh-enterprises.com",
  "adenau@ffh-enterprises.com",
  "daun@ffh-enterprises.com",
  "emmelshausen@ffh-enterprises.com",
  "immobilien@ffh-enterprises.com"
)
# Ein Postfach, das die App NICHT lesen darf (nur für den Test am Ende)
$NotAllowed = "paul@ffh-enterprises.com"

# --- Module (einmalig) -----------------------------------------------------
foreach ($m in "Microsoft.Graph.Applications", "ExchangeOnlineManagement") {
  if (-not (Get-Module -ListAvailable -Name $m)) {
    Write-Host "Installiere $m …"
    Install-Module $m -Scope CurrentUser -Force -AllowClobber
  }
}

# --- 1 + 2: App in Entra -----------------------------------------------------
Connect-MgGraph -Scopes "Application.ReadWrite.All" -NoWelcome
$TenantId = (Get-MgContext).TenantId

$app = Get-MgApplication -Filter "displayName eq '$AppName'" | Select-Object -First 1
if (-not $app) {
  $app = New-MgApplication -DisplayName $AppName -SignInAudience "AzureADMyOrg"
  Write-Host "App angelegt."
} else {
  Write-Host "App existiert bereits, wird weiterverwendet."
}

$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId }

$secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{
  displayName   = "Vercel"
  endDateTime   = (Get-Date).AddMonths(24)
}
# Wichtig: KEINE Graph-Berechtigung Mail.Read in Entra – der Zugriff kommt nur über Exchange (Schritt 3).

# --- 3: Zugriff in Exchange, beschränkt auf die Rechnungspostfächer -----------
Connect-ExchangeOnline -ShowBanner:$false

# Kleine Tenants müssen eigene Rollen/Bereiche erst freischalten (einmalig, ggf. "bereits aktiviert")
try { Enable-OrganizationCustomization -ErrorAction Stop } catch { Write-Host "Hinweis: $($_.Exception.Message)" }

$group = Get-DistributionGroup -Identity "App Rechnungseingang" -ErrorAction SilentlyContinue
if (-not $group) {
  New-DistributionGroup -Name "App Rechnungseingang" -Alias "app-rechnungseingang" -Type Security -Members $Mailboxes | Out-Null
  Set-DistributionGroup "App Rechnungseingang" -HiddenFromAddressListsEnabled $true
}
$GroupDN = (Get-Group "App Rechnungseingang").DistinguishedName

if (-not (Get-ServicePrincipal -Identity $app.AppId -ErrorAction SilentlyContinue)) {
  New-ServicePrincipal -AppId $app.AppId -ObjectId $sp.Id -DisplayName $AppName | Out-Null
}
if (-not (Get-ManagementScope -Identity "Rechnungspostfaecher" -ErrorAction SilentlyContinue)) {
  New-ManagementScope -Name "Rechnungspostfaecher" -RecipientRestrictionFilter "MemberOfGroup -eq '$GroupDN'" | Out-Null
}
$existing = Get-ManagementRoleAssignment -RoleAssignee $app.AppId -Role "Application Mail.Read" -ErrorAction SilentlyContinue
if (-not $existing) {
  New-ManagementRoleAssignment -App $app.AppId -Role "Application Mail.Read" -CustomResourceScope "Rechnungspostfaecher" | Out-Null
}

# --- 4: Werte ausgeben + prüfen ------------------------------------------------
Write-Host "`n================ Werte für Vercel ================"
Write-Host "MS_TENANT_ID     = $TenantId"
Write-Host "MS_CLIENT_ID     = $($app.AppId)"
Write-Host "MS_CLIENT_SECRET = $($secret.SecretText)"
Write-Host "=================================================="
Write-Host "Den Schlüssel jetzt kopieren – er wird nie wieder angezeigt.`n"

$ErrorActionPreference = "Continue"
Write-Host "Test – muss True sein:"
Test-ServicePrincipalAuthorization -Identity $app.AppId -Resource "hamm@ffh-enterprises.com" | Select-Object RoleName, InScope | Format-Table
Write-Host "Test – muss False sein (Postfach außerhalb der Gruppe):"
try {
  Test-ServicePrincipalAuthorization -Identity $app.AppId -Resource $NotAllowed | Select-Object RoleName, InScope | Format-Table
} catch {
  Write-Host "  Testpostfach $NotAllowed nicht gefunden – oben im Skript eine vorhandene Adresse eintragen."
}
Write-Host "Bis der Zugriff greift, können 30 Minuten bis 2 Stunden vergehen."

Disconnect-ExchangeOnline -Confirm:$false
Disconnect-MgGraph | Out-Null
