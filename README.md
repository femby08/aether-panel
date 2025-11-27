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

Aether Panel funciona en la mayoría de distribuciones Linux modernas gracias a su instalador universal.

| Familia | Distribuciones Probadas | Gestor | Estado |
| :--- | :--- | :--- | :--- |
| **Debian** | Ubuntu 20.04+, Debian 10+, Mint | `apt` | ✅ **Nativo** |
| **RHEL** | Fedora 36+, CentOS 8+, Rocky | `dnf` | ✅ **Nativo** |
| **Arch** | Arch Linux, Manjaro | `pacman` | ✅ **Nativo** |

---

## 🚀 Novedades V1.5.x

Esta versión introduce mejoras masivas en la Calidad de Vida (QoL).

* **🎮 Consola Interactiva:** Envía comandos directamente desde la web.
* **💡 Sistema de Ayuda:** Tooltips `(?)` explicativos en toda la configuración.
* **⌨️ Atajos de Teclado:** Usa `Alt + 1-8` para navegar y `ESC` para cerrar.
* **🌐 IP Copiable:** Haz clic en la IP de la cabecera para copiarla.
* **🎨 Temas:** Soporte total para Modo Claro y Oscuro en todos los menús.
* **🛠️ Instalador Universal:** Soporte automático para Fedora, Arch y CentOS.

---

## 📦 Instalación Rápida

Accede a tu terminal como usuario `root` y ejecuta el siguiente comando:

```bash
curl -sL [https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh](https://raw.githubusercontent.com/reychampi/aether-panel/main/installserver.sh) | bash

El instalador automático se encargará de:

    Detectar tu Sistema Operativo.

    Instalar dependencias (Java, Node.js, Git, Zip, Rsync).

    Configurar el servicio automático systemd.

    Iniciar el panel en el puerto 3000.

⚡ Características

    🖥️ Monitor en Tiempo Real: Gráficas de CPU, RAM y Disco en tiempo real.

    💻 Consola Web: Terminal en vivo con colores y envío de comandos.

    📂 Gestor de Archivos: Editor de texto integrado con resaltado de sintaxis.

    📥 Instalador de Núcleos: Vanilla, Paper, Fabric y Forge a un clic.

    📦 Backups: Crea y restaura copias de seguridad al instante.

    🧩 Tienda de Mods: Buscador integrado para instalar mods populares.

    ⚙️ Configuración Visual: Edita server.properties con interruptores fáciles.

    🔄 Smart Updater: Sistema de actualizaciones OTA integrado.

🛠️ Solución de Problemas

El panel no carga en el navegador Asegúrate de abrir el puerto 3000 en tu firewall:
Bash

# Ubuntu/Debian
sudo ufw allow 3000/tcp

# Fedora/CentOS
sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload

Error "command not found" o "$'\r'" Si subiste los archivos desde Windows manualmente, ejecuta esto para corregir el formato:
Bash

sed -i 's/\r$//' /opt/aetherpanel/*.sh

<div align="center">

Desarrollado con ❤️ por ReyChampi Reportar un Bug

</div>
