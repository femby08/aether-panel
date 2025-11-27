#!/bin/bash

# ============================================================
# AETHER PANEL - SMART SYNC UPDATER
# Compara el contenido real (Checksum). 
# Si difiere -> Sobrescribe. Si es igual -> Ignora.
# ============================================================

LOG="/opt/aetherpanel/update.log"
APP_DIR="/opt/aetherpanel"
BACKUP_DIR="/opt/aetherpanel_backup_temp"
TEMP_DIR="/tmp/aether_update_temp"
REPO_ZIP="https://github.com/reychampi/aether-panel/archive/refs/heads/main.zip"

# Función de Log
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG
    echo -e "$1"
}

log_msg "--- 🌌 INICIANDO COMPROBACIÓN DE INTEGRIDAD ---"

# 1. PREPARACIÓN
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 2. DESCARGA
log_msg "⬇️  Bajando código fuente desde GitHub..."
wget -q "$REPO_ZIP" -O /tmp/aether_update.zip || curl -L "$REPO_ZIP" -o /tmp/aether_update.zip
unzip -q -o /tmp/aether_update.zip -d "$TEMP_DIR"

# Localizar raíz del zip
NEW_SOURCE=$(find "$TEMP_DIR" -name "package.json" | head -n 1 | xargs dirname)

if [ -z "$NEW_SOURCE" ]; then
    log_msg "❌ ERROR: ZIP descargado corrupto."
    exit 1
fi

# 3. ANÁLISIS DE CAMBIOS CRÍTICOS (Backend)
# Antes de sincronizar, miramos si han cambiado archivos que requieren reinicio.
RESTART_REQUIRED=0

# Lista de archivos del núcleo que exigen reinicio si cambian
CORE_FILES=("server.js" "mc_manager.js" "package.json")

for file in "${CORE_FILES[@]}"; do
    if ! diff -q "$APP_DIR/$file" "$NEW_SOURCE/$file" > /dev/null 2>&1; then
        log_msg "⚠️  Cambio detectado en núcleo: $file"
        RESTART_REQUIRED=1
    fi
done

# 4. SINCRONIZACIÓN INTELIGENTE (RSYNC)
# -a: Mantiene permisos
# -v: Verbose
# -c: CHECKSUM (Compara contenido, no fecha. ESTO ES LA CLAVE)
# --delete: Borra archivos en local que ya no existan en GitHub
# --exclude: Protege tus datos
log_msg "🔄 Sincronizando archivos..."

rsync -avc --delete \
    --exclude='settings.json' \
    --exclude='servers/' \
    --exclude='backups/' \
    --exclude='node_modules/' \
    --exclude='update.log' \
    --exclude='eula.txt' \
    --exclude='server.properties' \
    "$NEW_SOURCE/" "$APP_DIR/" >> $LOG 2>&1

# Asegurar permisos de ejecución en scripts
chmod +x "$APP_DIR/updater.sh"
chmod +x "$APP_DIR/installserver.sh"

# 5. GESTIÓN DE DEPENDENCIAS
if [ $RESTART_REQUIRED -eq 1 ]; then
    # Si cambió package.json, actualizamos librerías
    if ! diff -q "$APP_DIR/package.json" "$NEW_SOURCE/package.json" > /dev/null 2>&1; then
        log_msg "📦 Actualizando dependencias NPM..."
        cd "$APP_DIR"
        npm install --production >> $LOG 2>&1
    fi
fi

# 6. ACCIONES POST-SYNC
if [ $RESTART_REQUIRED -eq 1 ]; then
    log_msg "🚀 Reiniciando servicio para aplicar cambios del núcleo..."
    systemctl restart aetherpanel
    
    # Verificación de arranque
    sleep 5
    if systemctl is-active --quiet aetherpanel; then
        log_msg "✅ Aether Panel reiniciado y operativo."
    else
        log_msg "🚨 ERROR: El panel no arrancó tras la actualización."
        # Aquí podrías restaurar backup si quisieras
    fi
else
    log_msg "✅ Sincronización completada. No se requiere reinicio (Solo cambios visuales o sin cambios)."
fi

# Limpieza
rm -rf "$TEMP_DIR" /tmp/aether_update.zip
