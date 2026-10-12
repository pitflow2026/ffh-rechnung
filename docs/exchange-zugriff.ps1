# ---------------------------------------------------------------------------
# FFH Rechnungseingang – Lesezugriff NUR auf die Rechnungspostfächer
#
# Gibt der App "Application Mail.Read" über RBAC for Applications in
# Exchange Online, beschränkt auf eine Gruppe mit genau diesen Postfächern.
# Alle anderen Postfächer im Tenant bleiben für die App unsichtbar.
#
# Voraussetzungen:
#   - Install-Module ExchangeOnlineManagement   (einmalig)
#   - Rolle "Organization Management" in Exchange Online
#   - In Entra ID KEINE Graph-Berechtigung "Mail.Read" für die App erteilen
#     (Entra-Rechte gelten zusätzlich und würden die Beschränkung aufheben)
#
# Die beiden IDs findest du in Entra ID unter "Unternehmensanwendungen"
# (Enterprise applications) → FFH Rechnungseingang → Übersicht.
# NICHT unter App-Registrierungen: dort steht eine andere Objekt-ID.
# ---------------------------------------------------------------------------

$AppId    = "<Anwendungs-ID (Client-ID)>"
$ObjectId = "<Objekt-ID aus Unternehmensanwendungen>"
$AppName  = "FFH Rechnungseingang"

$Mailboxes = @(
  "info@ffh-enterprises.com",
  "rechnung@ffh-enterprises.com",
  "hamm@ffh-enterprises.com",
  "adenau@ffh-enterprises.com",
  "daun@ffh-enterprises.com",
  "emmelshausen@ffh-enterprises.com",
  "immobilien@ffh-enterprises.com"
)

Connect-ExchangeOnline

# 1. Gruppe mit den Rechnungspostfächern (nur direkte Mitglieder zählen)
New-DistributionGroup -Name "App Rechnungseingang" -Alias "app-rechnungseingang" `
  -Type Security -Members $Mailboxes
Set-DistributionGroup "App Rechnungseingang" -HiddenFromAddressListsEnabled $true
$GroupDN = (Get-Group "App Rechnungseingang").DistinguishedName

# 2. Verweis auf die App in Exchange anlegen
New-ServicePrincipal -AppId $AppId -ObjectId $ObjectId -DisplayName $AppName

# 3. Bereich = Mitglieder der Gruppe
New-ManagementScope -Name "Rechnungspostfaecher" -RecipientRestrictionFilter "MemberOfGroup -eq '$GroupDN'"

# 4. Leserecht für Mails nur in diesem Bereich
New-ManagementRoleAssignment -App $AppId -Role "Application Mail.Read" -CustomResourceScope "Rechnungspostfaecher"

# 5. Prüfen: erstes Postfach muss InScope = True liefern, das zweite False
Test-ServicePrincipalAuthorization -Identity $AppName -Resource "hamm@ffh-enterprises.com" | Format-Table
Test-ServicePrincipalAuthorization -Identity $AppName -Resource "<ein anderes Postfach, z. B. deins>" | Format-Table

# Hinweis: Bis die echten Abrufe greifen, kann es 30 Minuten bis 2 Stunden dauern.
# Ein weiteres Postfach später hinzufügen:
#   Add-DistributionGroupMember "App Rechnungseingang" -Member neu@ffh-enterprises.com
