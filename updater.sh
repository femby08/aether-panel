#!/bin/bash

# ============================================================
# AETHER PANEL - SMART UPDATER
# ============================================================

LOG="/opt/aetherpanel/update.log"
APP_DIR="/opt/aetherpanel"
BACKUP_DIR="/opt/aetherpanel_backup_temp"
TEMP_DIR="/tmp/aether_update_temp"
# CAMBIO: URL del ZIP corregida
REPO_ZIP="https://github.com/reychampi/aether-panel/archive/refs/heads/main.zip"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG
    echo -e "$1"
}

log_msg "--- 🌌 AETHER UPDATE PROCESS STARTED ---"

# PREPARACIÓN
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Descargar Repo
wget -q "$REPO_ZIP" -O /tmp/aether_update.zip || curl -L "$REPO_ZIP" -o /tmp/aether_update.zip
unzip -q -o /tmp/aether_update.zip -d "$TEMP_DIR"

# Encontrar raíz
NEW_SOURCE=$(find "$TEMP_DIR" -name "package.json" | head -n 1 | xargs dirname)

if [ -z "$NEW_SOURCE" ]; then
    log_msg "❌ ERROR: ZIP corrupto o estructura inválida."
    exit 1
fi

# VERSIÓN
if [ -f "$APP_DIR/package.json" ]; then
    CURRENT_VERSION=$(node -p "require('$APP_DIR/package.json').version")
else
    CURRENT_VERSION="0.0.0"
fi
NEW_VERSION=$(node -p "require('$NEW_SOURCE/package.json').version")

log_msg "🔎 Actual: $CURRENT_VERSION | Nueva: $NEW_VERSION"

# LÓGICA
if [ "$CURRENT_VERSION" == "$NEW_VERSION" ]; then
    log_msg "ℹ️ Versiones coinciden. Buscando cambios visuales..."
    
    if diff -r -q "$APP_DIR/public" "$NEW_SOURCE/public" > /dev/null; then
        log_msg "✅ Todo al día."
    else
        log_msg "🎨 Aplicando Hot-Swap..."
        cp -rf "$NEW_SOURCE/public/"* "$APP_DIR/public/"
        log_msg "✅ Interfaz actualizada."
    fi

else
    log_msg "⚠️  NUEVA VERSIÓN DETECTADA. Actualizando..."

    # BACKUP
    rm -rf "$BACKUP_DIR"
    cp -r "$APP_DIR" "$BACKUP_DIR"

    systemctl stop aetherpanel
    
    # ACTUALIZAR ARCHIVOS (Preservando configuración si existiera)
    # Excluimos settings.json para no sobrescribir configuración de usuario
    rsync -av --exclude='settings.json' --exclude='servers' "$NEW_SOURCE/" "$APP_DIR/"
    
    cd "$APP_DIR"
    npm install --production >> $LOG 2>&1
    chmod +x "$APP_DIR/updater.sh"

    # TEST ARRANQUE
    log_msg "🚀 Arrancando..."
    systemctl start aetherpanel
    sleep 10
    
    if systemctl is-active --quiet aetherpanel; then
        log_msg "✅ ACTUALIZACIÓN EXITOSA: V$NEW_VERSION."
    else
        log_msg "🚨 FALLO. EJECUTANDO ROLLBACK..."
        systemctl stop aetherpanel
        # Restauración segura
        if [ -d "$BACKUP_DIR" ]; then
            cp -r "$BACKUP_DIR/"* "$APP_DIR/"
            systemctl start aetherpanel
            log_msg "✅ ROLLBACK COMPLETADO."
        else
            log_msg "❌ ERROR CRÍTICO: No se encontró backup."
        fi
    fi
fi

rm -rf "$TEMP_DIR" /tmp/aether_update.zip
