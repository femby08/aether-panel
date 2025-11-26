#!/bin/bash

# ============================================================
# AETHER PANEL - INSTALLER (Bootstrapper)
# Instala dependencias y delega la descarga al Updater
# ============================================================

APP_DIR="/opt/aetherpanel"
# 1. CAMBIO: URL corregida a aether-panel
UPDATER_URL="https://raw.githubusercontent.com/reychampi/aether-panel/main/updater.sh"

# 2. CAMBIO: Variable para definir el usuario manualmente
SERVICE_USER="root" 

# Verificación de ejecución (debe ser sudo para instalar, aunque el servicio corra como otro usuario)
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, ejecuta este script como root (sudo) para la instalación inicial."
  exit 1
fi

echo "🌌 Iniciando instalación de Aether Panel..."

# INSTALACIÓN DE DEPENDENCIAS
echo "📦 Instalando dependencias..."
apt-get update -qq
apt-get install -y -qq curl wget unzip git default-jre

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y -qq nodejs
fi

# PREPARACIÓN DE DIRECTORIO
mkdir -p "$APP_DIR"
# Aseguramos permisos si se cambia el usuario
chown -R $SERVICE_USER:$SERVICE_USER "$APP_DIR"

# DESCARGA DEL UPDATER
echo "⬇️ Descargando el sistema de actualizaciones..."
curl -H 'Cache-Control: no-cache' -s "$UPDATER_URL" -o "$APP_DIR/updater.sh"
chmod +x "$APP_DIR/updater.sh"
chown $SERVICE_USER:$SERVICE_USER "$APP_DIR/updater.sh"

# CREACIÓN DEL SERVICIO SYSTEMD
echo "⚙️ Configurando servicio del sistema para usuario: $SERVICE_USER..."
cat > /etc/systemd/system/aetherpanel.service <<EOF
[Unit]
Description=Aether Panel Service
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aetherpanel

# EJECUTAR UPDATER
echo "🚀 Ejecutando instalación inicial..."
# Ejecutamos el updater como el usuario designado para evitar problemas de permisos
if [ "$SERVICE_USER" == "root" ]; then
    bash "$APP_DIR/updater.sh"
else
    su -c "bash $APP_DIR/updater.sh" $SERVICE_USER
fi

echo "✅ Instalación completada. Aether Panel está listo."
