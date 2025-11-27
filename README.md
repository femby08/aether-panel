<div align="center">

<img src="https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.png" alt="Aether Panel Logo" width="120" height="120">

# 🌌 Aether Panel

**El panel de control ligero, moderno y potente para servidores de Minecraft.**
Gestión inteligente, monitoreo en tiempo real y diseño Glassmorphism.

[![Version](https://img.shields.io/badge/version-1.5.2-8b5cf6?style=for-the-badge&logo=git)](https://github.com/reychampi/aether-panel)
[![Status](https://img.shields.io/badge/status-stable-10b981?style=for-the-badge)](https://github.com/reychampi/aether-panel)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)

[Instalación](#-instalación-rápida) • [Sistemas Compatibles](#-sistemas-operativos-soportados) • [Características](#-características)

</div>

---

## ✨ Descripción

**Aether Panel** es una solución todo-en-uno para administrar servidores de Minecraft en entornos Linux. Diseñado para ser visualmente impactante y técnicamente robusto, elimina la necesidad de configuraciones complejas por terminal, ofreciendo una interfaz web reactiva y fácil de usar.

![Dashboard Preview](https://raw.githubusercontent.com/reychampi/aether-panel/main/public/logo.png)

---

## 🐧 Sistemas Operativos Soportados

Aether Panel funciona en la mayoría de distribuciones Linux modernas gracias a su instalador universal inteligente.

| Familia | Distribuciones Probadas | Gestor | Estado |
| :--- | :--- | :--- | :--- |
| **Debian** | Ubuntu 20.04+, Debian 10+, Mint | `apt` | ✅ **Nativo** |
| **RHEL** | Fedora 36+, CentOS 8+, Rocky | `dnf` | ✅ **Nativo** |
| **Arch** | Arch Linux, Manjaro | `pacman` | ✅ **Nativo** |

---

## 🚀 Novedades V1.5.x

Esta versión introduce mejoras masivas en la Calidad de Vida (QoL) y la experiencia de usuario.

### 🎮 Experiencia de Usuario (UI/UX)
* **Consola Interactiva:** Envía comandos al servidor directamente desde la web con una terminal dedicada.
* **Sistema de Ayuda:** Tooltips `(?)` explicativos en todas las opciones del `server.properties`.
* **Atajos de Teclado:** Navega rápido usando `Alt + 1-8` y cierra ventanas con `ESC`.
* **IP Copiable:** Haz clic en la IP de la cabecera para copiarla al portapapeles.

### 🛠️ Mejoras Técnicas
* **Instalador Universal:** Detección automática de distro (Ubuntu/Fedora/Arch) e instalación de dependencias correspondientes.
* **Actualizador UI:** Nuevo botón para forzar la actualización de la interfaz gráfica sin reiniciar el servidor.
* **Soporte de Temas:** Compatibilidad total con Modo Claro y Oscuro en todos los menús.
* **Resolución de Versiones:** Lógica mejorada para descargar Forge, Fabric y Paper sin errores.

---

## 📦 Instalación Rápida

Accede a tu terminal como usuario `root` y ejecuta el siguiente comando:
<pre>
curl -sL [https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh](https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh) | bash
</pre>
El instalador automático se encargará de:

    Detectar tu Sistema Operativo.

    Instalar dependencias necesarias (Java, Node.js, Git, Zip, Rsync).

    Configurar el servicio automático systemd.

    Descargar el núcleo del panel y los recursos.

    Iniciar el servicio en el puerto 3000.

⚡ Características

    🖥️ Monitor en Tiempo Real: Gráficas de CPU, RAM y Disco con actualización por Sockets.

    💻 Consola Web: Terminal en vivo con colores y envío de comandos.

    📂 Gestor de Archivos: Editor de texto integrado (Ace Editor) con resaltado de sintaxis.

    📥 Instalador de Núcleos: Descarga Vanilla, Paper, Fabric o Forge con un solo clic.

    📦 Sistema de Backups: Crea y restaura copias de seguridad en segundos.

    🧩 Tienda de Mods: Buscador integrado para instalar mods populares (JEI, JourneyMap, etc.).

    ⚙️ Configuración Visual: Edita server.properties con interruptores y ayudas visuales.

    🔄 Smart Updater: Sistema de actualizaciones OTA (Over-The-Air) integrado.

🛠️ Solución de Problemas Frecuentes

El panel no carga en el navegador Asegúrate de abrir el puerto 3000 en tu firewall:

    Ubuntu/Debian:
<pre>
sudo ufw allow 3000/tcp
</pre>

Fedora/CentOS:
<pre>
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --reload
</pre>
Error "command not found" o "$'\r'" al instalar Si subiste los archivos manualmente desde Windows, es posible que tengan formato incorrecto. Ejecuta en la carpeta del panel:
Bash
<pre>
sed -i 's/\r$//' *.sh
</pre>
<div align="center">

Desarrollado por ReyChampi Reportar un Bug

</div>
