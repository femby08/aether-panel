<div align="center">

<img src="https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.svg" alt="Aether Panel Logo" width="120" height="120">

# 🌌 Aether Panel

**El panel de control ligero, moderno y potente para servidores de Minecraft.**
Gestión inteligente, monitoreo en tiempo real y diseño Glassmorphism.

[![Version](https://img.shields.io/badge/version-1.4.3-8b5cf6?style=for-the-badge&logo=git)](https://github.com/reychampi/aether-panel)
[![Status](https://img.shields.io/badge/status-stable-10b981?style=for-the-badge)](https://github.com/reychampi/aether-panel)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)

[Instalación](#-instalación-rápida) • [Características](#-características) • [Changelog](#-novedades-v14x)

</div>

---

## ✨ Descripción

**Aether Panel** es una solución todo-en-uno para administrar servidores de Minecraft en entornos Linux. Diseñado para ser visualmente impactante y técnicamente robusto, elimina la necesidad de configuraciones complejas por terminal, ofreciendo una interfaz web reactiva y fácil de usar.

![Dashboard Preview](https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.png)
*(Nota: Se recomienda subir una captura de pantalla real del panel y reemplazar este link)*

---

## 🚀 Novedades V1.4.3

Esta actualización se centra en la estabilidad, la corrección de errores críticos y mejoras visuales en el monitoreo.

### 🛠️ Correcciones Críticas (Core)
* **Fix LF/CRLF:** Solucionado el error `$'\r': command not found`. Todos los scripts (`.sh`) ahora usan saltos de línea Linux (LF) nativos.
* **Dependencias:** Añadido `rsync` a la lista de instalación obligatoria para evitar fallos en el actualizador.
* **Servicio SystemD:** Mejorada la detección automática de la ruta de `node` para evitar que el servicio se detenga en ciertos VPS.
* **Resolvers de Descarga:** Nueva lógica inteligente para obtener enlaces de descarga de **Forge, Fabric y Paper** sin errores.

### 🎨 Mejoras Visuales y UI
* **Gráficas Reales:**
    * La **RAM** ahora se muestra en **GB** (antes MB) con decimales limpios.
    * La gráfica de **CPU** ahora tiene escala fija (0-100%) para evitar picos visuales exagerados.
* **Configuración (server.properties):**
    * Nuevo diseño alineado con "Cajas" para cada opción.
    * Detección automática de valores `true/false` convertidos a **Interruptores (Switches)** modernos.
* **Monitor de Disco:** Implementado cálculo recursivo real (`du`) para mostrar el espacio ocupado exacto.

---

## 📦 Instalación Rápida

Ejecuta este comando en tu terminal (Ubuntu/Debian) como usuario `root`:

```bash
bash <(curl -s [https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh](https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh))

El instalador se encargará de:

    Instalar dependencias (Java, Node.js, Git, Zip, Rsync).

    Configurar el servicio automático systemd.

    Descargar el núcleo del panel.

    Iniciar el servicio en el puerto 3000.

⚡ Características

    🖥️ Monitor en Tiempo Real: Gráficas de CPU, RAM y Disco con actualización por Sockets.

    💻 Consola Web: Terminal en vivo con colores y envío de comandos.

    📂 Gestor de Archivos: Editor de texto integrado (Ace Editor) con resaltado de sintaxis.

    📥 Instalador de Núcleos: Descarga Vanilla, Paper, Fabric o Forge con un solo clic.

    📦 Sistema de Backups: Crea y restaura copias de seguridad en segundos.

    🧩 Tienda de Mods: Instalador rápido para mods populares (JEI, JourneyMap, etc.).

    ⚙️ Configuración Visual: Edita server.properties con una interfaz gráfica amigable.

    🔄 Smart Updater: Sistema de actualizaciones OTA (Over-The-Air) integrado.

🛠️ Solución de Problemas Frecuentes

El panel no carga en el navegador Asegúrate de que el puerto 3000 está abierto en tu firewall:
Bash

sudo ufw allow 3000/tcp

Si usas Oracle Cloud o AWS, abre también el puerto en el panel de seguridad de tu proveedor.

Error "command not found" al instalar Si descargaste los archivos manualmente en Windows y los subiste, es posible que tengan formato incorrecto. Ejecuta:
Bash

sed -i 's/\r$//' /opt/aetherpanel/installserver.sh

<div align="center">

Desarrollado con ❤️ por ReyChampi Reportar un Bug

</div>
