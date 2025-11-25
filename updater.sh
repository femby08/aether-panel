#!/bin/bash
# Nebula Bulletproof Updater
LOG="/opt/aetherpanel/update.log"
REPO_ZIP="https://github.com/reychampi/nebula/archive/refs/heads/main.zip"

echo "--- UPDATE START $(date) ---" > $LOG

# 1. Parar servicio para evitar bloqueos
systemctl stop aetherpanel >> $LOG 2>&1

# 2. Limpiar temporales antiguos
rm -rf /tmp/nebula_temp
mkdir -p /tmp/nebula_temp

# 3. Descargar el ZIP
echo "Downloading..." >> $LOG
wget -q $REPO_ZIP -O /tmp/nebula_temp/update.zip

# 4. Descomprimir
echo "Unzipping..." >> $LOG
unzip -o /tmp/nebula_temp/update.zip -d /tmp/nebula_temp >> $LOG 2>&1

# 5. LÓGICA DE BÚSQUEDA INTELIGENTE (CRUCIAL)
# Busca dónde narices está el 'server.js' dentro de lo que acabamos de bajar
SOURCE_DIR=$(find /tmp/nebula_temp -name "server.js" -type f -printf "%h\n" | head -n 1)

if [ -z "$SOURCE_DIR" ]; then
    echo "ERROR CRÍTICO: No se encontró server.js en el ZIP descargado." >> $LOG
    # Si falla, intentamos arrancar lo que había antes
    systemctl start aetherpanel
    exit 1
fi

echo "Found source at: $SOURCE_DIR" >> $LOG

# 6. Copiar archivos (Sobrescribir instalación)
cp -rf $SOURCE_DIR/* /opt/aetherpanel/ >> $LOG 2>&1

# 7. Mover logos si quedaron sueltos (Fix visual)
[ -f /opt/aetherpanel/logo.svg ] && mv /opt/aetherpanel/logo.svg /opt/aetherpanel/public/
[ -f /opt/aetherpanel/logo.ico ] && mv /opt/aetherpanel/logo.ico /opt/aetherpanel/public/

# 8. Reinstalar dependencias (Por si cambiaste package.json)
cd /opt/aetherpanel
npm install --production >> $LOG 2>&1

# 9. Asegurar permisos de ejecución
chmod +x /opt/aetherpanel/updater.sh

# 10. Arrancar de nuevo
echo "Starting service..." >> $LOG
systemctl start aetherpanel >> $LOG 2>&1
echo "UPDATE SUCCESSFUL" >> $LOG
