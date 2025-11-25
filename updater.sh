#!/bin/bash

# ============================================================
# NEBULA SMART UPDATER (FAIL-SAFE)
# - Auto-Backup
# - Health Check
# - Auto-Rollback
# ============================================================

LOG="/opt/aetherpanel/update.log"
BACKUP_DIR="/opt/aetherpanel_backup_temp"
APP_DIR="/opt/aetherpanel"
REPO_ZIP="https://github.com/reychampi/nebula/archive/refs/heads/main.zip"

echo "--- UPDATE START $(date) ---" > $LOG

# 1. CREAR PUNTO DE RESTAURACIÓN (BACKUP)
echo "Creating backup snapshot..." >> $LOG
rm -rf $BACKUP_DIR
cp -r $APP_DIR $BACKUP_DIR

# 2. DETENER SERVICIO
systemctl stop aetherpanel >> $LOG 2>&1

# 3. DESCARGAR NUEVA VERSIÓN
echo "Downloading update..." >> $LOG
rm -rf /tmp/nebula_update /tmp/update.zip
mkdir -p /tmp/nebula_update
wget -q $REPO_ZIP -O /tmp/update.zip

# 4. DESCOMPRIMIR
echo "Unzipping..." >> $LOG
unzip -q -o /tmp/update.zip -d /tmp/nebula_update

# 5. DETECTAR CARPETA RAÍZ (INTELIGENTE)
EXTRACTED_DIR=$(ls /tmp/nebula_update | head -n 1)
NEW_FILES="/tmp/nebula_update/$EXTRACTED_DIR"

# 6. APLICAR ACTUALIZACIÓN (SOBRESCRIBIR)
echo "Applying files..." >> $LOG
cp -r $NEW_FILES/* $APP_DIR/ >> $LOG 2>&1

# 7. ORGANIZAR LOGOS (Para que no se pierdan)
[ -f $APP_DIR/logo.svg ] && mv $APP_DIR/logo.svg $APP_DIR/public/
[ -f $APP_DIR/logo.png ] && mv $APP_DIR/logo.png $APP_DIR/public/
[ -f $APP_DIR/logo.ico ] && mv $APP_DIR/logo.ico $APP_DIR/public/

# 8. LIMPIEZA DE BASURA
rm -f $APP_DIR/installserver.sh $APP_DIR/README.md $APP_DIR/.gitignore

# 9. RESTAURAR PERMISOS Y DEPENDENCIAS
chmod +x $APP_DIR/updater.sh
cd $APP_DIR
npm install --production >> $LOG 2>&1

# 10. PRUEBA DE ARRANQUE (HEALTH CHECK)
echo "Testing new version..." >> $LOG
systemctl start aetherpanel >> $LOG 2>&1

# Esperamos 10 segundos para ver si el servicio aguanta encendido
sleep 10

if systemctl is-active --quiet aetherpanel; then
    echo "✅ UPDATE SUCCESSFUL: System is stable." >> $LOG
    # Éxito: Borramos el backup temporal
    rm -rf $BACKUP_DIR
else
    echo "🚨 UPDATE FAILED: System crashed. ROLLING BACK..." >> $LOG
    
    # --- FASE DE ROLLBACK (EMERGENCIA) ---
    systemctl stop aetherpanel
    # Borramos la versión rota
    rm -rf $APP_DIR/*
    # Restauramos la copia de seguridad
    cp -r $BACKUP_DIR/* $APP_DIR/
    # Arrancamos la versión vieja que sí funcionaba
    systemctl start aetherpanel
    
    echo "✅ ROLLBACK COMPLETED: Restored previous version." >> $LOG
fi
