#!/bin/bash

# ============================================================
# NEBULA UPDATER - COMPATIBLE CON ESTRUCTURA GITHUB
# Respeta la carpeta /public existente en el repositorio
# ============================================================

LOG="/opt/aetherpanel/update.log"
APP_DIR="/opt/aetherpanel"
BACKUP_DIR="/opt/aetherpanel_backup_temp"
REPO_ZIP="https://github.com/reychampi/nebula/archive/refs/heads/main.zip"

echo "--- UPDATE START $(date) ---" > $LOG

# 1. BACKUP DE SEGURIDAD
# Guardamos lo que tienes ahora por si acaso explota
rm -rf $BACKUP_DIR
cp -r $APP_DIR $BACKUP_DIR

# 2. DETENER SERVICIO
# Paramos el panel para poder sobrescribir archivos en uso
systemctl stop aetherpanel >> $LOG 2>&1

# 3. DESCARGAR Y DESCOMPRIMIR
echo "Downloading & Unzipping..." >> $LOG
rm -rf /tmp/nebula_update /tmp/update.zip
mkdir -p /tmp/nebula_update

# Intentamos wget, si falla usamos curl (robustez)
wget -q $REPO_ZIP -O /tmp/update.zip || curl -L $REPO_ZIP -o /tmp/update.zip
unzip -q -o /tmp/update.zip -d /tmp/nebula_update

# 4. IDENTIFICAR LA RAÍZ DE LA DESCARGA
# Buscamos dónde quedó el server.js descomprimido para saber la ruta base
EXTRACTED_ROOT=$(find /tmp/nebula_update -name "server.js" | head -n 1 | xargs dirname)

if [ -z "$EXTRACTED_ROOT" ]; then
    echo "🚨 ERROR: Estructura del ZIP inválida. Abortando." >> $LOG
    systemctl start aetherpanel
    exit 1
fi

# 5. APLICAR ACTUALIZACIÓN (SOBRESCRIBIR)
echo "Syncing files..." >> $LOG
# cp -rf copia recursivamente. Esto actualizará 'server.js' en la raíz
# Y actualizará el contenido de 'public/' dentro de 'public/' automáticamente
cp -rf "$EXTRACTED_ROOT"/* "$APP_DIR/" >> $LOG 2>&1

# 6. LIMPIEZA Y PERMISOS (CRÍTICO)
# Aseguramos que el script sea ejecutable para la próxima vez
chmod +x $APP_DIR/updater.sh
# Borramos basura que no necesitamos en prod
rm -f $APP_DIR/README.md $APP_DIR/.gitignore $APP_DIR/installserver.sh

# 7. DEPENDENCIAS
cd $APP_DIR
# Si el package.json cambió, instalamos lo nuevo.
# 'npm ci' es mejor para instalaciones limpias, pero 'install' es más seguro si no hay package-lock.
npm install --production >> $LOG 2>&1

# 8. REINICIAR
echo "Restarting..." >> $LOG
systemctl start aetherpanel

sleep 5
if systemctl is-active --quiet aetherpanel; then
    echo "✅ UPDATE SUCCESSFUL" >> $LOG
    rm -rf $BACKUP_DIR
else
    echo "🚨 FAILED. Restoring backup..." >> $LOG
    systemctl stop aetherpanel
    # Restauramos todo tal cual estaba
    cp -rf $BACKUP_DIR/* $APP_DIR/
    systemctl start aetherpanel
fi
