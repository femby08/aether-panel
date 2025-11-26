#!/bin/bash

# ============================================================
# AETHER PANEL - UPDATER (FORCE VERSION FIX)
# ============================================================

LOG="/opt/aetherpanel/update.log"
APP_DIR="/opt/aetherpanel"
BACKUP_DIR="/opt/aetherpanel_backup_temp"
TEMP_DIR="/tmp/aether_update_temp"
REPO_ZIP="https://github.com/reychampi/aether-panel/archive/refs/heads/main.zip"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG
    echo -e "$1"
}

log_msg "--- 🌌 AETHER UPDATE PROCESS STARTED ---"

# 1. LIMPIEZA Y DESCARGA
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

log_msg "⬇️  Descargando última versión..."
wget -q "$REPO_ZIP" -O /tmp/aether_update.zip || curl -L "$REPO_ZIP" -o /tmp/aether_update.zip
unzip -q -o /tmp/aether_update.zip -d "$TEMP_DIR"

# Encontrar la carpeta raíz dentro del ZIP
NEW_SOURCE=$(find "$TEMP_DIR" -name "package.json" | head -n 1 | xargs dirname)

if [ -z "$NEW_SOURCE" ]; then
    log_msg "❌ ERROR: ZIP corrupto o estructura inválida."
    exit 1
fi

# 2. LEER VERSIONES
if [ -f "$APP_DIR/package.json" ]; then
    CURRENT_VERSION=$(node -p "require('$APP_DIR/package.json').version")
else
    CURRENT_VERSION="0.0.0"
fi
NEW_VERSION=$(node -p "require('$NEW_SOURCE/package.json').version")

log_msg "🔎 Actual: $CURRENT_VERSION | Nueva: $NEW_VERSION"

# 3. LÓGICA DE ACTUALIZACIÓN
if [ "$CURRENT_VERSION" == "$NEW_VERSION" ]; then
    log_msg "ℹ️  Versiones coinciden. Buscando cambios visuales..."
    if diff -r -q "$APP_DIR/public" "$NEW_SOURCE/public" > /dev/null; then
        log_msg "✅ Todo al día."
    else
        log_msg "🎨 Aplicando cambios visuales (Hot-Swap)..."
        cp -rf "$NEW_SOURCE/public/"* "$APP_DIR/public/"
        # Forzar también descarga de logos por si acaso
        wget -q -O "$APP_DIR/public/logo.svg" "https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.svg"
        wget -q -O "$APP_DIR/public/logo.ico" "https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.ico"
        log_msg "✅ Interfaz actualizada."
    fi
else
    log_msg "⚠️  ACTUALIZANDO A V$NEW_VERSION..."

    # Crear Backup
    rm -rf "$BACKUP_DIR"
    cp -r "$APP_DIR" "$BACKUP_DIR"

    # Detener servicio
    systemctl stop aetherpanel
    
    # --- APLICAR CAMBIOS (FORCE MODE) ---
    # 1. Copiar todo EXCEPTO config de usuario
    rsync -av --exclude='settings.json' --exclude='servers' "$NEW_SOURCE/" "$APP_DIR/"
    
    # 2. FORZAR SOBRESCRITURA DE PACKAGE.JSON (Esto arregla tu bug)
    cp -f "$NEW_SOURCE/package.json" "$APP_DIR/package.json"
    
    # 3. Instalar dependencias nuevas si las hubiera
    cd "$APP_DIR"
    npm install --production >> $LOG 2>&1
    
    # 4. Permisos
    chmod +x "$APP_DIR/updater.sh"
    
    # Reiniciar servicio
    log_msg "🚀 Arrancando Aether Panel..."
    systemctl start aetherpanel
    
    # Verificación
    sleep 5
    if systemctl is-active --quiet aetherpanel; then
        log_msg "✅ ACTUALIZACIÓN EXITOSA: Ahora estás en la versión $NEW_VERSION."
    else
        log_msg "🚨 FALLO AL ARRANCAR. RESTAURANDO..."
        systemctl stop aetherpanel
        cp -r "$BACKUP_DIR/"* "$APP_DIR/"
        systemctl start aetherpanel
        log_msg "⏪ Restaurado a la versión anterior."
    fi
fi

# Limpieza
rm -rf "$TEMP_DIR" /tmp/aether_update.zip
