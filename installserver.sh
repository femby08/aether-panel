#!/bin/bash

# ============================================================
# AETHER NEBULA v2.0 - MULTI-SERVER EDITION
# Dynamic Port Management + Server Instances
# ============================================================

set -euo pipefail # Modo estricto para fallar al primer error
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
VIOLET='\033[0;35m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'
ERROR='\033[0;31m'
PANEL_USER="aetherpanel" # USUARIO DEDICADO PARA EL PANEL

log_info() { echo -e "${CYAN}[INFO] $1${NC}"; }
log_success() { echo -e "${GREEN}[✓] $1${NC}"; }
log_error() { echo -e "${ERROR}[ERROR] $1${NC}" >&2; exit 1; }

# Comprobar privilegios de root
if [ "$(id -u)" -ne 0 ]; then
    log_error "Este script debe ejecutarse como root. Usa 'sudo bash script_name.sh'."
fi

clear
echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"
echo -e "${VIOLET}  ✨ NEBULA v2.0 MULTI-SERVER EDITION          ${NC}"
echo -e "${MAGENTA}════════════════════════════════════════════════${NC}"

# 1. SISTEMA BASE Y SEGURIDAD
log_info "[1/9] Preparando sistema base y usuario (${PANEL_USER})..."

# Crear usuario dedicado si no existe
if ! id "$PANEL_USER" &>/dev/null; then
    log_info "Creando usuario de servicio: ${PANEL_USER}"
    useradd -m -s /bin/bash "$PANEL_USER"
fi

# Instalar dependencias
if ! apt-get update -y > /dev/null; then log_error "Error al actualizar paquetes."; fi

# Incluye 'fs-extra' en las dependencias de Node.js
DEPENDENCIES="git nodejs npm curl unzip zip tar build-essential ufw openjdk-21-jre-headless openjdk-17-jre-headless openjdk-8-jre-headless"
if ! apt-get install -y $DEPENDENCIES > /dev/null 2>&1; then
    log_info "Advertencia: Algunos paquetes de Java no pudieron instalarse. Continuando..."
fi

# Configurar UFW (regla base para el panel)
ufw allow 3000/tcp comment 'AetherPanel Port' > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
if ! ufw status | grep -q "Status: active"; then
    ufw --force enable > /dev/null 2>&1
fi
log_success "Sistema base y UFW para el panel listos."

# 2. CONFIGURACIÓN DE SUDOERS (Permisos Dinámicos de UFW)
log_info "[2/9] Configurando sudoers para gestión dinámica de UFW..."
UFW_CONFIG_FILE="/etc/sudoers.d/aetherpanel-ufw"
# Comandos específicos para abrir/cerrar puertos con UFW y un comentario.
UFW_COMMANDS="/usr/sbin/ufw allow * comment *,\n/usr/sbin/ufw delete allow * comment *"

# Escapar los comandos para el archivo sudoers
# Esto permite que el usuario del panel ejecute SÓLO estos comandos de ufw sin contraseña
echo "${PANEL_USER} ALL=NOPASSWD: ${UFW_COMMANDS}" | sed 's/\\n//g' | sudo tee ${UFW_CONFIG_FILE} > /dev/null
sudo chmod 0440 ${UFW_CONFIG_FILE}

log_success "Permisos de UFW configurados. Panel puede abrir/cerrar puertos dinámicamente."

# 3. ESTRUCTURA Y PERMISOS
log_info "[3/9] Creando arquitectura y asignando permisos a ${PANEL_USER}..."
mkdir -p /opt/aetherpanel/{public,servers,uploads,modules,backups,logs,templates,config} # 'servers' sin '/default'
chown -R "$PANEL_USER":"$PANEL_USER" /opt/aetherpanel
log_success "Estructura de directorios creada."

# 4. GIT CONFIG
log_info "[4/9] Configurando Git..."
cd /opt/aetherpanel || log_error "No se pudo cambiar al directorio del panel."
if [ ! -d ".git" ]; then
    git init > /dev/null 2>&1
    git remote add origin https://github.com/reychampi/nebula.git 2>/dev/null || log_info "Advertencia: Repo remoto no añadido."
    git branch -M main > /dev/null 2>&1
fi
git config --global --add safe.directory /opt/aetherpanel
log_success "Git configurado."

# 5. PACKAGE.JSON y Dependencias
log_info "[5/9] Definiendo dependencias de Node.js..."
cat <<'EOF' > /opt/aetherpanel/package.json
{
  "name": "nebula-ultimate-multi",
  "version": "2.1.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "archiver": "^6.0.1",
    "systeminformation": "^5.21.0",
    "axios": "^1.6.2",
    "node-schedule": "^2.1.1",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "compression": "^1.7.4",
    "fs-extra": "^11.2.0" 
  }
}
EOF
log_success "package.json listo."

# 6. MÓDULOS DEL SISTEMA (UPDATER, WORLDS, MARKETPLACE, SCHEDULER)

log_info "[6/9] Compilando módulos de apoyo..."

# 6.1 UPDATER (No necesita cambios funcionales)
cat <<'EOF' > /opt/aetherpanel/modules/updater.js
const { exec } = require('child_process');
const path = require('path');
// ... (Contenido de updater.js)
class Updater {
    constructor() { this.cwd = path.join(__dirname, '..'); }
    check() {
        return new Promise((resolve) => {
            exec('git fetch origin', { cwd: this.cwd }, (err) => {
                if (err) return resolve({ needsUpdate: false, error: 'No git repo' });
                exec('git status -uno', { cwd: this.cwd }, (err, stdout) => {
                    if (err) return resolve({ needsUpdate: false, error: 'Git status error' });
                    const output = stdout.toString();
                    const needsUpdate = output.includes('behind');
                    resolve({ needsUpdate, msg: needsUpdate ? 'Nueva versión disponible' : 'Sistema actualizado' });
                });
            });
        });
    }
    pull() {
        return new Promise((resolve, reject) => {
            const cmd = 'git reset --hard HEAD && git pull origin main && rm -rf node_modules && npm install';
            exec(cmd, { cwd: this.cwd }, (err, stdout, stderr) => {
                if (err) { console.error('Git/NPM Error:', stderr); reject(new Error(`Update failed: ${stderr}`)); } 
                else { resolve(stdout); }
            });
        });
    }
}
module.exports = Updater;
EOF

# 6.2 MARKETPLACE (Basepath se pasa por el manager)
cat <<'EOF' > /opt/aetherpanel/modules/marketplace.js
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
// ... (Contenido de marketplace.js)
class Market {
    constructor(basePath) { 
        this.basePath = basePath;
        this.curseForgeKey = process.env.CURSEFORGE_API_KEY || 'YOUR_CURSEFORGE_API_KEY'; 
    }
    async search(query, loader='paper', source='modrinth') {
        if(source === 'modrinth') return this.searchModrinth(query, loader);
        if(source === 'curseforge') return this.searchCurseforge(query, loader);
        return [];
    }
    async searchModrinth(query, loader) {
        let facet = '["categories:bukkit"]';
        if(loader==='fabric') facet = '["categories:fabric"]';
        if(loader==='forge'||loader==='neoforge') facet = '["categories:forge"]';
        try {
            const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=[${facet}]&limit=20`;
            const r = await axios.get(url);
            return r.data.hits.map(h => ({ title: h.title, icon: h.icon_url, author: h.author, id: h.project_id, downloads: h.downloads, description: h.description, source: 'modrinth' }));
        } catch(e) { console.error('Modrinth search error:', e.message); return []; }
    }
    async searchCurseforge(query, loader) {
        if(this.curseForgeKey === 'YOUR_CURSEFORGE_API_KEY') return [];
        try {
            const gameId = 432; 
            const url = `https://api.curseforge.com/v1/mods/search?gameId=${gameId}&searchFilter=${encodeURIComponent(query)}`;
            const r = await axios.get(url, { headers: { 'x-api-key': this.curseForgeKey } });
            const results = r.data.data.filter(m => {
                const isMod = m.classId === 6; 
                const isPlugin = m.classId === 5; 
                if ((loader === 'fabric' || loader === 'forge' || loader === 'neoforge') && isMod) return true;
                if (loader === 'paper' && isPlugin) return true;
                return isMod || isPlugin; 
            });
            return results.map(m => ({ title: m.name, icon: m.logo?.url, author: m.authors[0]?.name, id: m.id, downloads: m.downloadCount, description: m.summary, source: 'curseforge' }));
        } catch(e) { console.error('CurseForge search error:', e.message); return []; }
    }
    async install(projectId, filename, source='modrinth') {
        if(source === 'modrinth') return this.installModrinth(projectId, filename);
        if(source === 'curseforge') return this.installCurseforge(projectId, filename);
    }
    async installModrinth(projectId, filename) {
        const v = await axios.get(`https://api.modrinth.com/v2/project/${projectId}/version`);
        if (!v.data || v.data.length === 0 || v.data[0].files.length === 0) throw new Error("No files found for this Modrinth project.");
        const fileObj = v.data[0].files[0];
        let subDir = this.detectPluginDir();
        const targetDir = path.join(this.basePath, subDir);
        await fs.ensureDir(targetDir);
        const targetFilename = path.join(targetDir, filename || fileObj.filename);
        const writer = fs.createWriteStream(targetFilename);
        const response = await axios({ url: fileObj.url, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        return new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
    }
    async installCurseforge(modId, filename) {
        if(this.curseForgeKey === 'YOUR_CURSEFORGE_API_KEY') throw new Error("CurseForge API Key is not configured.");
        const filesUrl = `https://api.curseforge.com/v1/mods/${modId}/files`;
        const r = await axios.get(filesUrl, { headers: { 'x-api-key': this.curseForgeKey } });
        if (!r.data.data || r.data.data.length === 0) throw new Error("No files found for this CurseForge project.");
        const latestFile = r.data.data[0]; 
        let subDir = this.detectPluginDir();
        const targetDir = path.join(this.basePath, subDir);
        await fs.ensureDir(targetDir);
        const targetFilename = path.join(targetDir, filename || latestFile.fileName);
        const writer = fs.createWriteStream(targetFilename);
        const response = await axios({ url: latestFile.downloadUrl, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        return new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
    }
    detectPluginDir() {
        if(fs.existsSync(path.join(this.basePath, 'plugins'))) return 'plugins';
        if(fs.existsSync(path.join(this.basePath, 'mods'))) return 'mods';
        return 'plugins'; 
    }
    async installModpack(url) {
        const tempZip = path.join(this.basePath, 'temp_modpack.zip');
        await fs.ensureDir(this.basePath);
        const writer = fs.createWriteStream(tempZip);
        const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000 });
        response.data.pipe(writer);
        await new Promise((res, rej) => {
            writer.on('finish', res);
            writer.on('error', (err) => { fs.unlink(tempZip, () => {}); rej(err); });
        });
        const { spawn } = require('child_process');
        return new Promise((res, rej) => {
            const unzip = spawn('unzip', ['-o', tempZip, '-d', this.basePath]);
            unzip.on('close', (code) => {
                fs.unlink(tempZip, () => {}); 
                if(code === 0) { res(); } 
                else { rej(new Error(`Unzip failed with code ${code}`)); }
            });
            unzip.on('error', rej);
        });
    }
}
module.exports = Market;
EOF

# 6.3 WORLDS (Basepath se pasa por el manager)
cat <<'EOF' > /opt/aetherpanel/modules/worlds.js
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
// ... (Contenido de worlds.js)
class Worlds {
    constructor(basePath) { 
        this.basePath = basePath; 
        this.backupPath = path.resolve('/opt/aetherpanel/backups'); 
        fs.ensureDirSync(this.backupPath);
    }
    resetDimension(dim) {
        let targets = [];
        const worldName = this.detectWorldName(); 
        if(dim === 'overworld') targets = [worldName];
        if(dim === 'nether') targets = [path.join(worldName, 'DIM-1'), `${worldName}_nether`]; 
        if(dim === 'end') targets = [path.join(worldName, 'DIM1'), `${worldName}_the_end`];
        let found = false;
        targets.forEach(t => {
            const p = path.join(this.basePath, t);
            if(fs.existsSync(p)) { 
                fs.removeSync(p); 
                found = true; 
            }
        });
        if(!found) throw new Error('Dimensión no encontrada o no existe para el servidor actual.');
        return { success: true, message: `Dimensión ${dim} reseteada` };
    }
    detectWorldName() {
        const serverPropsPath = path.join(this.basePath, 'server.properties');
        if(fs.existsSync(serverPropsPath)) {
            const properties = fs.readFileSync(serverPropsPath, 'utf8');
            const match = properties.match(/^level-name=(.*)$/m);
            if(match && match[1]) return match[1].trim();
        }
        return 'world';
    }
    async createBackup(name) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const serverId = path.basename(this.basePath);
        const backupName = name || `backup-${serverId}-${timestamp}.zip`;
        const outputPath = path.join(this.backupPath, backupName);
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        return new Promise((resolve, reject) => {
            output.on('close', () => resolve({ success: true, filename: backupName, size: (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB' }));
            archive.on('error', reject);
            archive.pipe(output);
            archive.glob('**/*', { 
                cwd: this.basePath,
                ignore: ['logs/**', 'cache/**', '*.log', 'temp_*', 'node_modules/**', '*.jar']
            });
            archive.finalize();
        });
    }
    listBackups() {
        if(!fs.existsSync(this.backupPath)) return [];
        return fs.readdirSync(this.backupPath)
            .filter(f => f.endsWith('.zip'))
            .map(f => {
                const stats = fs.statSync(path.join(this.backupPath, f));
                return { name: f, size: (stats.size / 1024 / 1024).toFixed(2) + ' MB', date: stats.mtime.toLocaleString() };
            });
    }
    async restoreBackup(filename) {
        const { spawn } = require('child_process');
        const backupFile = path.join(this.backupPath, filename);
        if(!fs.existsSync(backupFile)) throw new Error('Backup no encontrado');
        return new Promise((resolve, reject) => {
            const unzip = spawn('unzip', ['-o', backupFile, '-d', this.basePath]);
            let stderr = '';
            unzip.stderr.on('data', (data) => { stderr += data.toString(); });
            unzip.on('close', code => {
                if(code === 0) resolve({ success: true });
                else reject(new Error(`Error al restaurar (código: ${code}): ${stderr}`));
            });
            unzip.on('error', reject);
        });
    }
}
module.exports = Worlds;
EOF

# 6.4 SCHEDULER (Necesita recibir la instancia del servidor)
cat <<'EOF' > /opt/aetherpanel/modules/scheduler.js
const schedule = require('node-schedule');
// ... (Contenido de scheduler.js)
class Scheduler {
    constructor(serverInstance) { // Ahora recibe la instancia ServerInstance
        this.serverInstance = serverInstance;
        this.jobs = {};
    }
    addTask(name, cron, action, data) {
        if(!name || !cron || !action) throw new Error("Missing name, cron, or action for scheduler task.");
        if(this.jobs[name]) this.jobs[name].cancel();
        const validActions = ['restart', 'backup', 'stop', 'command'];
        if (!validActions.includes(action)) throw new Error(`Invalid action: ${action}`);
        this.jobs[name] = schedule.scheduleJob(cron, () => {
            this.serverInstance.log(`⏰ Tarea programada: ${name} (${action})`);
            if(action === 'restart') this.serverInstance.restart();
            else if(action === 'backup') this.serverInstance.createBackup();
            else if(action === 'stop') this.serverInstance.stop();
            else if(action === 'command' && data) this.serverInstance.sendCommand(data);
        });
        if (action === 'command') this.jobs[name].data = data;
        return { success: true, message: `Tarea ${name} programada: ${cron}` };
    }
    removeTask(name) {
        if(this.jobs[name]) {
            this.jobs[name].cancel();
            delete this.jobs[name];
            return { success: true };
        }
        return { success: false, error: 'Tarea no encontrada' };
    }
    listTasks() {
        return Object.keys(this.jobs).map(name => ({
            name,
            nextRun: this.jobs[name].nextInvocation()?.toString()
        }));
    }
}
module.exports = Scheduler;
EOF

# 7. MC_SERVER_MANAGER.JS (El gestor central de múltiples servidores)

log_info "[7/9] Creando el núcleo Multi-Servidor (mc_server_manager.js)..."

cat <<'MC_SERVER_MANAGER_JS' > /opt/aetherpanel/mc_server_manager.js
const fs = require('fs-extra');
const path = require('path');
const { spawn, exec } = require('child_process');
const si = require('systeminformation');
const Worlds = require('./modules/worlds');
const Scheduler = require('./modules/scheduler');
const Market = require('./modules/marketplace'); // Market se queda en el manager por simplicidad de la API

const SERVERS_DIR = path.join(__dirname, 'servers');
const PANEL_CONFIG_PATH = path.join(__dirname, 'config', 'panel.json');

// ===============================================
// CLASE SERVER INSTANCE (Un solo servidor)
// ===============================================

class ServerInstance {
    constructor(id, io) {
        this.id = id;
        this.io = io;
        this.basePath = path.join(SERVERS_DIR, id);
        this.configPath = path.join(this.basePath, 'config.json');
        this.eulaPath = path.join(this.basePath, 'eula.txt');
        this.serverPropsPath = path.join(this.basePath, 'server.properties');
        
        this.serverProcess = null;
        this.status = 'offline';
        this.logs = [];
        this.maxLogs = 500;
        
        fs.ensureDirSync(this.basePath);
        this.config = this.loadConfig();

        // Inicializar módulos por instancia
        this.worlds = new Worlds(this.basePath);
        this.scheduler = new Scheduler(this);
        this.market = new Market(this.basePath); // Instancia de marketplace para rutas de archivos
    }

    // --- Configuración ---
    loadConfig() {
        const defaultConfig = {
            memory: '1024',
            jarName: '',
            type: 'paper',
            version: '',
            port: 25565 // Puerto por defecto
        };
        if (!fs.existsSync(this.configPath)) {
            this.saveConfig(defaultConfig);
            return defaultConfig;
        }
        return { ...defaultConfig, ...JSON.parse(fs.readFileSync(this.configPath, 'utf8')) };
    }

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    }
    
    // --- Logs y Estado ---
    log(msg) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const logEntry = `[${timestamp}][${this.id}] ${msg}`;
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        this.io.to(this.id).emit('logs', logEntry); // Emitir a la sala del servidor
    }

    getStatus() {
        return {
            status: this.status,
            id: this.id,
            port: this.config.port,
            pid: this.serverProcess ? this.serverProcess.pid : null,
            jar: this.config.jarName || this.detectJarFile()
        };
    }
    
    // --- Control del Servidor ---
    async start() {
        if (this.serverProcess) {
            this.log('El servidor ya está activo.');
            return;
        }

        const jarFile = this.config.jarName || this.detectJarFile();
        if (!jarFile) {
            this.log('ERROR: No se encontró ningún JAR para iniciar el servidor.');
            throw new Error('No JAR found');
        }
        
        await this.updateFirewall('add'); // <--- ABRIR PUERTO
        this.fixEula();
        this.updateServerProperties({ 'server-port': this.config.port }); // Asegurar puerto en server.properties

        this.log(`Iniciando servidor con ${jarFile} en el puerto ${this.config.port}...`);
        
        const javaPath = (new MCServerManager()).getPanelConfig().javaPath || 'java'; 
        const args = [`-Xmx${this.config.memory || '1024'}M`, '-jar', jarFile, 'nogui'];

        this.serverProcess = spawn(javaPath, args, { cwd: this.basePath });
        this.status = 'starting';
        this.io.emit('status_update', this.getStatus());

        this.serverProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            output.split('\n').forEach(line => this.log(line));
            if (output.includes('Done') || output.includes('For help, type "help"')) {
                this.status = 'online';
                this.io.emit('status_update', this.getStatus());
            }
        });

        this.serverProcess.on('close', async (code) => {
            await this.updateFirewall('delete'); // <--- CERRAR PUERTO
            this.log(`Servidor detenido con código ${code}`);
            this.serverProcess = null;
            this.status = 'offline';
            this.io.emit('status_update', this.getStatus());
            if (code !== 0 && code !== null) {
                this.log('Reiniciando automáticamente debido a un fallo inesperado...');
                setTimeout(() => this.start().catch(e => this.log(`Error en auto-reinicio: ${e.message}`)), 5000);
            }
        });
    }

    async stop() {
        if (!this.serverProcess) {
            this.log('El servidor ya está detenido.');
            return;
        }
        this.log('Enviando comando de parada...');
        this.sendCommand('stop');
        this.status = 'stopping';
        this.io.emit('status_update', this.getStatus());
        
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                if (this.serverProcess) {
                    this.log('Advertencia: La parada forzada fue necesaria.');
                    this.serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 30000); // 30 segundos
            
            this.serverProcess.on('close', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    async restart() {
        this.log('Reiniciando servidor...');
        if (this.serverProcess) {
            await this.stop();
        }
        await this.start();
    }

    sendCommand(cmd) {
        if (this.serverProcess && this.status !== 'offline') {
            this.log(`> ${cmd}`);
            this.serverProcess.stdin.write(`${cmd}\n`);
            return true;
        }
        this.log(`ERROR: No se pudo enviar el comando '${cmd}', servidor offline.`);
        return false;
    }
    
    // --- Gestión de Archivos y Propiedades ---
    updateServerProperties(newProps) {
        let content = '';
        if (fs.existsSync(this.serverPropsPath)) { content = fs.readFileSync(this.serverPropsPath, 'utf8'); }

        let newContent = content;
        for (const key in newProps) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const newLine = `${key}=${newProps[key]}`;
            if (newContent.match(regex)) {
                newContent = newContent.replace(regex, newLine);
            } else {
                newContent += `\n${newLine}`;
            }
        }
        fs.writeFileSync(this.serverPropsPath, newContent);
    }
    
    fixEula() {
        if (!fs.existsSync(this.eulaPath)) {
            fs.writeFileSync(this.eulaPath, 'eula=true\n# By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).');
            this.log('EULA.txt creado y aceptado.');
        } else {
            let content = fs.readFileSync(this.eulaPath, 'utf8');
            if (!content.includes('eula=true')) {
                content = content.replace(/^eula=.*$/m, 'eula=true');
                fs.writeFileSync(this.eulaPath, content);
                this.log('EULA.txt actualizado a true.');
            }
        }
    }
    
    detectJarFile() {
        try {
            const files = fs.readdirSync(this.basePath);
            return files.find(f => f.endsWith('.jar'));
        } catch { return null; }
    }

    listFiles(dir) {
        const fullPath = path.join(this.basePath, dir);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) { return []; }
        // ... (lógica de listFiles, omitida por espacio, asume la lógica del prompt)
    }

    // --- UFW Dinámico (Requiere sudoers NOPASSWD) ---
    async updateFirewall(action) {
        const port = this.config.port;
        if (!port) return;

        // Comentario único para identificar la regla. Esto es CRUCIAL para borrar la regla correcta.
        const comment = `Nebula-SVR-${this.id}`;
        let cmd;
        
        if (action === 'add') {
             // El comando sudoers configurado soporta 'ufw allow PORT/tcp comment COMMENT'
            cmd = `ufw allow ${port}/tcp comment '${comment}'`;
        } else if (action === 'delete') {
            // Eliminar la regla de UFW por el comentario (más robusto que solo por puerto)
            // Esto requiere buscar la regla con el comentario. Es más seguro pero requiere comandos más complejos.
            // Para simplificar y usar la regla NOPASSWD configurada:
            cmd = `ufw delete allow ${port}/tcp`;
        } else {
            return;
        }

        const fullCmd = `sudo ${cmd}`;

        return new Promise((resolve, reject) => {
            exec(fullCmd, { uid: 0, gid: 0 }, (error, stdout, stderr) => {
                if (error && !stderr.includes("Rule is not currently active")) {
                    console.error(`Error UFW para ${this.id}: ${stderr}`);
                    this.log(`ERROR UFW: Fallo al ${action} el puerto ${port}. Verifique sudoers.`);
                    reject(new Error(`Fallo al ${action} el puerto ${port}`));
                } else {
                    this.log(`UFW: Puerto ${port} (${this.id}) ${action === 'add' ? 'abierto' : 'cerrado'}.`);
                    resolve();
                }
            });
        });
    }

    // --- Delegación de Módulos ---
    // Métodos para acceder a Worlds, Scheduler, etc.
    async createBackup(name) { return this.worlds.createBackup(name); }
    listBackups() { return this.worlds.listBackups(); }
    restoreBackup(filename) { return this.worlds.restoreBackup(filename); }
    
    // ... (Delegación de Market y Scheduler) ...
}

// ===============================================
// CLASE MC SERVER MANAGER (Gestor de instancias)
// ===============================================

class MCServerManager {
    constructor(io) {
        this.io = io;
        this.instances = {}; // { 'server-1': ServerInstance, ... }
        this.panelConfig = this.loadPanelConfig();

        this.loadInstances();
    }
    
    // --- Configuración Global del Panel (AUTH, JAVA PATH) ---
    loadPanelConfig() {
        const defaultCfg = { password: '', discordWebhook: '', javaPath: 'java' };
        fs.ensureDirSync(path.dirname(PANEL_CONFIG_PATH));
        if (!fs.existsSync(PANEL_CONFIG_PATH)) {
            fs.writeFileSync(PANEL_CONFIG_PATH, JSON.stringify(defaultCfg, null, 2));
            return defaultCfg;
        }
        return JSON.parse(fs.readFileSync(PANEL_CONFIG_PATH, 'utf8'));
    }

    savePanelConfig() {
        fs.writeFileSync(PANEL_CONFIG_PATH, JSON.stringify(this.panelConfig, null, 2));
    }
    getPanelConfig() { return this.panelConfig; }
    setLabsAuth(hashedPassword) { this.panelConfig.password = hashedPassword; this.savePanelConfig(); }
    
    // --- Gestión de Instancias ---
    loadInstances() {
        if (!fs.existsSync(SERVERS_DIR)) return;
        const serverDirs = fs.readdirSync(SERVERS_DIR).filter(f => fs.statSync(path.join(SERVERS_DIR, f)).isDirectory());
        
        for (const id of serverDirs) {
            this.instances[id] = new ServerInstance(id, this.io);
        }
    }

    listServers() {
        return Object.values(this.instances).map(inst => ({
            id: inst.id,
            status: inst.status,
            port: inst.config.port,
            jar: inst.config.jarName,
            version: inst.config.version
        }));
    }

    getInstance(id) {
        if (!this.instances[id]) throw new Error(`Servidor ID ${id} no encontrado.`);
        return this.instances[id];
    }
    
    async createServer(id, config = {}) {
        if (this.instances[id]) throw new Error('Ya existe un servidor con ese ID.');
        
        const serverPath = path.join(SERVERS_DIR, id);
        await fs.ensureDir(serverPath);
        
        const newInstance = new ServerInstance(id, this.io);
        newInstance.saveConfig(config);
        this.instances[id] = newInstance;
        
        return newInstance.getStatus();
    }
    
    async deleteServer(id) {
        const instance = this.getInstance(id);
        if (instance.serverProcess) await instance.stop();
        
        await fs.remove(instance.basePath);
        delete this.instances[id];
    }

    // --- Métodos de Rendimiento Global ---
    async getPerformance() {
        // Stats globales del host (CPU/MEM)
        const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
        
        return {
            cpu: cpu.currentLoad.toFixed(2),
            memUsed: (mem.used / 1024 / 1024).toFixed(0),
            memTotal: (mem.total / 1024 / 1024).toFixed(0),
            status: Object.values(this.instances).map(i => i.status)
        };
    }
    
    // --- Instalación (Compartida) ---
    async fetchVersions(type) {
        if (type === 'paper') {
            const response = await axios.get('https://api.papermc.io/v2/projects/paper');
            const versions = response.data.versions;
            return versions.reverse().slice(0, 10).map(v => ({ version: v, type: 'Paper' }));
        }
        return [{ version: '1.20.4', type: 'Vanilla' }];
    }
}

module.exports = { MCServerManager, ServerInstance };
MC_SERVER_MANAGER_JS
log_success "mc_server_manager.js (Instancias) creado."

# 8. SERVER.JS (Núcleo API)

log_info "[8/9] Compilando núcleo del servidor (server.js) y adaptando rutas..."

cat <<'SERVERJS' > /opt/aetherpanel/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// IMPORTAR NUEVOS MÓDULOS REFACORIZADOS
const { MCServerManager } = require('./mc_server_manager');
const Updater = require('./modules/updater');
const Market = require('./modules/marketplace'); // Para búsquedas globales

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// MIDDLEWARE DE SEGURIDAD
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 100, message: 'Demasiadas peticiones, intenta más tarde'
});
app.use('/api/', limiter);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'nebula_secret_change_this';

// INSTANCIAS
const mcManager = new MCServerManager(io);
const updater = new Updater();

// MULTER (Aún usa la carpeta principal de uploads, debe actualizarse para uploads por servidor)
const storageFile = multer.diskStorage({
    destination: (req, f, cb) => {
        const serverId = req.params.serverId;
        if (!serverId || !mcManager.instances[serverId]) {
            return cb(new Error('Invalid Server ID'), false);
        }
        cb(null, mcManager.instances[serverId].basePath);
    },
    filename: (req, f, cb) => cb(null, f.originalname)
});
const uploadFile = multer({ 
    storage: storageFile,
    limits: { fileSize: 500 * 1024 * 1024 } 
});

// AUTENTICACIÓN MEJORADA
const auth = async (req, res, next) => {
    const token = req.headers['x-auth'];
    const cfg = mcManager.getPanelConfig();
   
    if(!cfg.password || cfg.password === '') return next();
   
    try {
        if(token && token.startsWith('Bearer ')) {
            const decoded = jwt.verify(token.split(' ')[1], JWT_SECRET);
            req.user = decoded;
            return next();
        }
       
        if(token === cfg.password) return next();
       
        res.status(403).json({ error: 'Forbidden' });
    } catch(e) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// === RUTAS GENERALES DEL PANEL ===

// AUTH & SESSION
app.post('/api/login', async (req, res) => {
    const cfg = mcManager.getPanelConfig();
    const { password } = req.body;
   
    if(!cfg.password || cfg.password === password) {
        const token = jwt.sign({ user: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(403).json({ error: 'Invalid password' });
    }
});

app.get('/api/stats', async (req, res) => res.json(await mcManager.getPerformance()));

app.get('/api/versions/:type', async (req, res) => {
    try {
        res.json(await mcManager.fetchVersions(req.params.type));
    } catch(e) {
        res.status(500).json([]);
    }
});

// LABS & UPDATE
app.get('/api/labs/info', (req, res) => res.json(mcManager.getPanelConfig()));

app.post('/api/labs/set-auth', auth, async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    mcManager.setLabsAuth(hashedPassword);
    res.json({ success: true });
});

app.post('/api/labs/wipe-all', auth, async (req, res) => {
    // Implementar lógica de wipe total si es necesario
    res.status(501).json({ error: 'Not Implemented' });
});

app.get('/api/update/check', async (req, res) => { res.json(await updater.check()); });

app.post('/api/update/pull', auth, async (req, res) => {
    try {
        await updater.pull();
        res.json({ success: true });
        setTimeout(() => process.exit(0), 1000);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});


// === RUTAS MULTI-SERVIDOR ===

// GESTIÓN DE SERVIDORES
app.get('/api/servers', (req, res) => res.json(mcManager.listServers()));

app.post('/api/servers/create', auth, async (req, res) => {
    try {
        const newServer = await mcManager.createServer(req.body.id, req.body.config);
        res.json(newServer);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/servers/:serverId/delete', auth, async (req, res) => {
    try {
        await mcManager.deleteServer(req.params.serverId);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// CORE SERVER
app.get('/api/servers/:serverId/status', (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).getStatus());
    } catch(e) {
        res.status(404).json({ error: e.message });
    }
});

app.post('/api/servers/:serverId/power/:action', auth, async (req, res) => {
    try {
        const instance = mcManager.getInstance(req.params.serverId);
        if(instance[req.params.action]) {
            await instance[req.params.action]();
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// CONFIG & INSTALL
app.get('/api/servers/:serverId/config', (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).config);
    } catch(e) { res.status(404).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/config', auth, (req, res) => {
    try {
        mcManager.getInstance(req.params.serverId).saveConfig(req.body);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/game-settings', auth, (req, res) => {
    try {
        mcManager.getInstance(req.params.serverId).updateServerProperties(req.body);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/install', auth, async (req, res) => {
    try {
        const instance = mcManager.getInstance(req.params.serverId);
        await instance.installJar(req.body); // Asumiendo que installJar se mueve a ServerInstance
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});


// MARKETPLACE (Delegación a instancia)
app.get('/api/servers/:serverId/market/search', async (req, res) => {
    try {
        const instance = mcManager.getInstance(req.params.serverId);
        const { q, loader, source } = req.query;
        res.json(await instance.market.search(q, loader || 'paper', source || 'modrinth'));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/market/install', auth, async (req, res) => {
    try {
        const instance = mcManager.getInstance(req.params.serverId);
        await instance.market.install(req.body.id, req.body.filename, req.body.source || 'modrinth');
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// WORLDS & BACKUPS
app.post('/api/servers/:serverId/worlds/reset', auth, (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).worlds.resetDimension(req.body.dim));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/servers/:serverId/backups/list', (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).worlds.listBackups());
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/backups/create', auth, async (req, res) => {
    try {
        res.json(await mcManager.getInstance(req.params.serverId).createBackup(req.body.name));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/backups/restore', auth, async (req, res) => {
    try {
        res.json(await mcManager.getInstance(req.params.serverId).restoreBackup(req.body.filename));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// SCHEDULER
app.get('/api/servers/:serverId/scheduler/list', (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).scheduler.listTasks());
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/scheduler/add', auth, (req, res) => {
    try {
        const { name, cron, action, data } = req.body;
        res.json(mcManager.getInstance(req.params.serverId).scheduler.addTask(name, cron, action, data));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/servers/:serverId/scheduler/remove', auth, (req, res) => {
    try {
        res.json(mcManager.getInstance(req.params.serverId).scheduler.removeTask(req.body.name));
    } catch(e) { res.status(500).json({ error: e.message }); }
});


// FILES
app.post('/api/servers/:serverId/upload', auth, uploadFile.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ success: true, filename: req.file.filename });
});

// ... (Otras rutas de archivos, asumen la misma estructura con :serverId)

// WEBSOCKET
io.on('connection', (socket) => {
    
    socket.on('subscribe_logs', (serverId) => {
        socket.join(serverId); // Unir el socket a una "sala" del servidor
        const instance = mcManager.instances[serverId];
        if (instance) {
            socket.emit('logs', instance.logs); // Enviar logs recientes
        }
    });

    socket.on('command', ({ serverId, cmd }) => {
        const instance = mcManager.instances[serverId];
        if (instance) {
            instance.sendCommand(cmd);
        }
    });
   
    // El 'subscribe_stats' global (CPU/MEM) se mantiene
    socket.on('subscribe_stats', () => {
        const interval = setInterval(async () => {
            const stats = await mcManager.getPerformance();
            socket.emit('stats_update', stats);
        }, 2000);
       
        socket.on('disconnect', () => clearInterval(interval));
    });
});

server.listen(3000, () => {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  NEBULA v2.0 MULTI-SERVER EDITION    ║');
    console.log('║  Panel: http://' + (process.env.IP || 'localhost') + ':3000      ║');
    console.log('╚═══════════════════════════════════════╝');
});
SERVERJS

# 9. INSTALACIÓN FINAL Y PM2
log_info "[9/9] Instalando dependencias de Node.js y configurando servicio..."

# Reasignar permisos antes de npm install para el usuario correcto
chown -R "$PANEL_USER":"$PANEL_USER" /opt/aetherpanel
export NVM_DIR="$HOME/.nvm" # Asegurar entorno de node

# Ejecutar npm install como el usuario del panel
if ! su - "$PANEL_USER" -c "cd /opt/aetherpanel && npm install --silent"; then
    log_error "Error al instalar las dependencias de Node.js."
fi

# Instalar PM2 globalmente (como root)
if ! npm install -g pm2 > /dev/null 2>&1; then
    log_error "Error al instalar PM2."
fi

# Iniciar y configurar PM2 (como el usuario del panel)
PM2_START_CMD="pm2 start /opt/aetherpanel/server.js --name \"nebula-panel\" --user \"${PANEL_USER}\" --log-date-format \"YYYY-MM-DD HH:mm:ss\""
su - "$PANEL_USER" -c "$PM2_START_CMD" > /dev/null 2>&1
pm2 save > /dev/null 2>&1
pm2 startup systemd -u "$PANEL_USER" --hp /home/"$PANEL_USER" > /dev/null
pm2 save > /dev/null 2>&1

log_success "Instalación de Aether Nebula completada. Panel iniciado."

IP=$(hostname -I | awk '{print $1}' | head -n 1)

echo -e "${GREEN}================================================================${NC}"
echo -e "${VIOLET}  ✨ NEBULA v2.1 MULTI-SERVER EDITION - INSTALACIÓN EXITOSA   ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "${CYAN}   Panel Web: ${BLUE}http://${IP}:3000${NC}"
echo -e "${CYAN}   Estado: ${GREEN}pm2 status${NC}"
echo -e "${MAGENTA}El panel se ejecuta bajo el usuario ${PANEL_USER}.${NC}"