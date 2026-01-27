#!/bin/bash
# Script di avvio per MedReportAndSign su macOS
# Questo script rimuove gli attributi di quarantena e lancia l'applicazione

APP_PATH="/Applications/MedReportAndSign.app"

echo "=== Avvio MedReportAndSign su macOS ==="
echo ""

# Verifica che l'app sia installata
if [ ! -d "$APP_PATH" ]; then
    echo "ERRORE: MedReportAndSign.app non trovata in /Applications"
    echo "Installare prima l'applicazione."
    exit 1
fi

echo "1. Rimozione attributi di quarantena..."
sudo xattr -cr "$APP_PATH" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "   ✓ Attributi di quarantena rimossi con successo"
else
    echo "   ⚠ Impossibile rimuovere attributi (potrebbe non essere necessario)"
fi

echo ""
echo "2. Avvio applicazione..."
open "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "   ✓ MedReportAndSign avviato con successo!"
    echo ""
    echo "Se l'applicazione non si apre:"
    echo "- Prova ad avviarla manualmente dal Finder"
    echo "- Vai in Preferenze di Sistema → Sicurezza e Privacy"
    echo "- Clicca 'Apri comunque' se presente"
else
    echo "   ✗ Errore nell'avvio dell'applicazione"
    echo ""
    echo "Prova ad avviare manualmente:"
    echo "   /Applications/MedReportAndSign.app/Contents/MacOS/MedReportAndSign"
    exit 1
fi
