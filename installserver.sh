#!/bin/bash

# ============================================================
# AETHER PANEL - INSTALLER (Bootstrapper)
# ============================================================

APP_DIR="/opt/aetherpanel"
UPDATER_URL="https://raw.githubusercontent.com/reychampi/aether-panel/main/updater.sh"
SERVICE_USER="root" 

# Verificación de root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, ejecuta este script como root (sudo)."
  exit 1
fi

echo "🌌 Iniciando instalación de Aether Panel..."

# 1. Dependencias
echo "📦 Instalando dependencias del sistema..."
apt-get update -qq
apt-get install -y -qq curl wget unzip git default-jre

# Node.js Check
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y -qq nodejs
fi

# 2. Preparar Directorios
mkdir -p "$APP_DIR/public"
chown -R $SERVICE_USER:$SERVICE_USER "$APP_DIR"

# 3. DESCARGA DE ASSETS (LOGOS) - NUEVO
echo "🎨 Descargando recursos gráficos..."
curl -s -L "https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.svg" -o "$APP_DIR/public/logo.svg"
curl -s -L "https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.ico" -o "$APP_DIR/public/logo.ico"

# Asegurar permisos de los logos
chown $SERVICE_USER:$SERVICE_USER "$APP_DIR/public/logo.svg"
chown $SERVICE_USER:$SERVICE_USER "$APP_DIR/public/logo.ico"

# 4. Descargar Updater
echo "⬇️ Descargando sistema de actualizaciones..."
curl -H 'Cache-Control: no-cache' -s "$UPDATER_URL" -o "$APP_DIR/updater.sh"
chmod +x "$APP_DIR/updater.sh"
chown $SERVICE_USER:$SERVICE_USER "$APP_DIR/updater.sh"

# 5. Servicio SystemD
echo "⚙️ Configurando servicio..."
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

# 6. Ejecutar instalación final
echo "🚀 Ejecutando instalación del núcleo..."
if [ "$SERVICE_USER" == "root" ]; then
    bash "$APP_DIR/updater.sh"
else
    su -c "bash $APP_DIR/updater.sh" $SERVICE_USER
fi

echo "✅ Instalación completada. Aether Panel está listo."
