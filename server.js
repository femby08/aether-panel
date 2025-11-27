const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const MCManager = require('./mc_manager');
const osUtils = require('os-utils');
const os = require('os');
const multer = require('multer');
const axios = require('axios');
const { exec, spawn } = require('child_process');

// --- INICIALIZACIÓN ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const upload = multer({ dest: os.tmpdir() });

// --- DIRECTORIOS ---
const SERVER_DIR = path.join(__dirname, 'servers', 'default');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Asegurar que existan los directorios
if (!fs.existsSync(SERVER_DIR)) fs.mkdirSync(SERVER_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- GESTOR MINECRAFT ---
const mcServer = new MCManager(io);

// --- CLIENTE API GITHUB ---
const apiClient = axios.create({ headers: { 'User-Agent': 'Aether-Panel/1.4.3' }, timeout: 10000 });
const REPO_RAW = 'https://raw.githubusercontent.com/reychampi/aether-panel/main';

// --- UTILIDADES ---
const getDirSize = (dirPath) => {
    let size = 0;
    try {
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) size += getDirSize(filePath);
                else size += stats.size;
            });
        }
    } catch(e) {}
    return size;
};

// ==========================================
//                 RUTAS API
// ==========================================

// --- INFO DEL SISTEMA ---
app.get('/api/info', (req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        res.json({ version: pkg.version });
    } catch (e) {
        res.json({ version: 'Unknown' });
    }
});

// --- SISTEMA DE ACTUALIZACIONES (SOFT UPDATES ACTIVADAS) ---
app.get('/api/update/check', async (req, res) => {
    try {
        const localPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        // Timestamp para evitar caché
        const remotePkg = (await apiClient.get(`${REPO_RAW}/package.json?t=${Date.now()}`)).data;
        
        // 1. Hard Update (Cambio de versión numérica)
        if (remotePkg.version !== localPkg.version) {
            return res.json({ type: 'hard', local: localPkg.version, remote: remotePkg.version });
        }

        // 2. Soft Update (Cambios visuales en /public)
        // Comparamos el contenido real de los archivos
        const files = ['public/index.html', 'public/style.css', 'public/app.js'];
        let hasChanges = false;
        
        for (const f of files) {
            try {
                const remoteContent = (await apiClient.get(`${REPO_RAW}/${f}?t=${Date.now()}`)).data;
                const localPath = path.join(__dirname, f);
                if (fs.existsSync(localPath)) {
                    const localContent = fs.readFileSync(localPath, 'utf8');
                    // Si el contenido es diferente, hay actualización visual
                    if (JSON.stringify(remoteContent) !== JSON.stringify(localContent)) {
                        hasChanges = true; 
                        break;
                    }
                }
            } catch(e) {}
        }

        if (hasChanges) return res.json({ type: 'soft', local: localPkg.version, remote: remotePkg.version });
        res.json({ type: 'none' });

    } catch (e) {
        res.json({ type: 'error' });
    }
});

app.post('/api/update/perform', async (req, res) => {
    const { type } = req.body;
    
    // HARD UPDATE: Llama al updater.sh y reinicia servicio
    if (type === 'hard') {
        io.emit('toast', { type: 'warning', msg: '🔄 Iniciando actualización segura...' });
        const updater = spawn('bash', ['/opt/aetherpanel/updater.sh'], { detached: true, stdio: 'ignore' });
        updater.unref();
        res.json({ success: true, mode: 'hard' });
        setTimeout(() => process.exit(0), 1000);
    } 
    // SOFT UPDATE: Sobrescribe archivos visuales en caliente
    else if (type === 'soft') {
        io.emit('toast', { type: 'info', msg: '🎨 Actualizando visuales...' });
        try {
            const files = ['public/index.html', 'public/style.css', 'public/app.js'];
            for (const f of files) {
                const c = (await apiClient.get(`${REPO_RAW}/${f}?t=${Date.now()}`)).data;
                fs.writeFileSync(path.join(__dirname, f), typeof c === 'string' ? c : JSON.stringify(c));
            }
            // Bajamos logos también por si acaso
            exec(`wget -q -O /opt/aetherpanel/public/logo.svg ${REPO_RAW}/public/logo.svg`);
            exec(`wget -q -O /opt/aetherpanel/public/logo.ico ${REPO_RAW}/public/logo.ico`);
            
            res.json({ success: true, mode: 'soft' });
        } catch (e) { 
            res.status(500).json({ error: e.message }); 
        }
    }
});

// --- AJUSTES (RAM) ---
app.post('/api/settings', (req, res) => {
    try {
        const { ram } = req.body;
        if (ram) {
            fs.writeFileSync(path.join(__dirname, 'settings.json'), JSON.stringify({ ram }));
            mcServer.loadSettings();
            res.json({ success: true, ram });
        } else {
            res.status(400).json({ error: 'Missing RAM parameter' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        if(fs.existsSync(path.join(__dirname, 'settings.json'))) {
            res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8')));
        } else {
            res.json({ ram: '4G' });
        }
    } catch(e) {
        res.json({ ram: '4G' });
    }
});

// --- RESOLUCIÓN DE VERSIONES (MINECRAFT) ---
app.post('/api/nebula/versions', async (req, res) => {
    try {
        const t = req.body.type;
        let l = [];
        if (t === 'vanilla') {
            l = (await apiClient.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).data.versions
                .filter(v => v.type === 'release')
                .map(v => ({ id: v.id, url: v.url, type: 'vanilla' }));
        } else if (t === 'paper') {
            l = (await apiClient.get('https://api.papermc.io/v2/projects/paper')).data.versions.reverse()
                .map(v => ({ id: v, type: 'paper' }));
        } else if (t === 'fabric') {
            l = (await apiClient.get('https://meta.fabricmc.net/v2/versions/game')).data
                .filter(v => v.stable)
                .map(v => ({ id: v.version, type: 'fabric' }));
        } else if (t === 'forge') {
            const p = (await apiClient.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).data.promos;
            const s = new Set();
            Object.keys(p).forEach(k => {
                const v = k.split('-')[0];
                if (v.match(/^\d+\.\d+(\.\d+)?$/)) s.add(v);
            });
            l = Array.from(s).sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
                .map(v => ({ id: v, type: 'forge' }));
        }
        res.json(l);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'API Error' });
    }
});

app.post('/api/nebula/resolve-vanilla', async (req, res) => {
    try {
        const d = (await apiClient.get(req.body.url)).data;
        res.json({ url: d.downloads.server.url });
    } catch (e) {
        res.status(500).json({});
    }
});

app.post('/api/nebula/resolve-forge', async (req, res) => {
    try {
        const version = req.body.version;
        const promos = (await apiClient.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).data.promos;
        let forgeBuild = promos[`${version}-recommended`] || promos[`${version}-latest`];
        if (!forgeBuild) throw new Error("Versión no encontrada");
        const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeBuild}/forge-${version}-${forgeBuild}-installer.jar`;
        res.json({ url });
    } catch (e) {
        res.status(500).json({ error: 'Forge Resolve Failed' });
    }
});

// --- INSTALADOR ---
app.post('/api/install', async (req, res) => {
    try {
        await mcServer.installJar(req.body.url, req.body.filename);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({});
    }
});

app.post('/api/mods/install', async (req, res) => {
    const { url, name } = req.body;
    const d = path.join(SERVER_DIR, 'mods');
    if (!fs.existsSync(d)) fs.mkdirSync(d);
    
    io.emit('toast', { type: 'info', msg: `Instalando ${name}...` });
    
    exec(`wget -q -O "${path.join(d, name.replace(/\s+/g, '_') + '.jar')}" "${url}"`, (e) => {
        if (e) io.emit('toast', { type: 'error', msg: 'Error al descargar mod' });
        else io.emit('toast', { type: 'success', msg: 'Mod Instalado' });
    });
    res.json({ success: true });
});

// --- MONITOR Y ESTADO ---
app.get('/api/stats', (req, res) => {
    osUtils.cpuUsage((cpuPercent) => {
        exec(`du -sb ${SERVER_DIR}`, (error, stdout) => {
            let diskBytes = 0;
            if (!error && stdout) {
                diskBytes = parseInt(stdout.split(/\s+/)[0]);
            } else {
                diskBytes = getDirSize(SERVER_DIR);
            }

            const cpus = os.cpus();
            const cpuFreq = cpus.length > 0 ? cpus[0].speed : 0;
            const totalMem = os.totalmem();
            const freeMem = os.freemem();

            res.json({
                cpu: cpuPercent * 100,
                cpu_freq: cpuFreq,
                ram_total: totalMem,
                ram_free: freeMem,
                ram_used: totalMem - freeMem,
                disk_used: diskBytes,
                disk_total: 20 * 1024 * 1024 * 1024 
            });
        });
    });
});

app.get('/api/status', (req, res) => res.json(mcServer.getStatus()));

app.post('/api/power/:a', async (req, res) => {
    try {
        if (mcServer[req.params.a]) await mcServer[req.params.a]();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({});
    }
});

// --- GESTOR DE ARCHIVOS ---
app.get('/api/files', (req, res) => {
    const t = path.join(SERVER_DIR, (req.query.path || '').replace(/\.\./g, ''));
    if (!fs.existsSync(t)) return res.json([]);
    
    const files = fs.readdirSync(t, { withFileTypes: true }).map(f => ({
        name: f.name,
        isDir: f.isDirectory(),
        size: f.isDirectory() ? '-' : (fs.statSync(path.join(t, f.name)).size / 1024).toFixed(1) + ' KB'
    }));
    res.json(files.sort((a, b) => a.isDir === b.isDir ? 0 : a.isDir ? -1 : 1));
});

app.post('/api/files/read', (req, res) => {
    const p = path.join(SERVER_DIR, req.body.file.replace(/\.\./g, ''));
    if (fs.existsSync(p)) res.json({ content: fs.readFileSync(p, 'utf8') });
    else res.status(404).json({});
});

app.post('/api/files/save', (req, res) => {
    fs.writeFileSync(path.join(SERVER_DIR, req.body.file.replace(/\.\./g, '')), req.body.content);
    res.json({ success: true });
});

app.post('/api/files/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        fs.renameSync(req.file.path, path.join(SERVER_DIR, req.file.originalname));
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// --- CONFIG Y BACKUPS ---
app.get('/api/config', (req, res) => res.json(mcServer.readProperties()));
app.post('/api/config', (req, res) => {
    mcServer.writeProperties(req.body);
    res.json({ success: true });
});

app.get('/api/backups', (req, res) => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
    res.json(fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.tar.gz'))
        .map(f => ({
            name: f,
            size: (fs.statSync(path.join(BACKUP_DIR, f)).size / 1048576).toFixed(2) + ' MB'
        }))
    );
});

app.post('/api/backups/create', (req, res) => {
    const backupName = `backup-${Date.now()}.tar.gz`;
    exec(`tar -czf "${path.join(BACKUP_DIR, backupName)}" -C "${path.join(__dirname, 'servers')}" default`, (e) => res.json({ success: !e }));
});

app.post('/api/backups/delete', (req, res) => {
    fs.unlinkSync(path.join(BACKUP_DIR, req.body.name));
    res.json({ success: true });
});

app.post('/api/backups/restore', async (req, res) => {
    await mcServer.stop();
    exec(`rm -rf "${SERVER_DIR}"/* && tar -xzf "${path.join(BACKUP_DIR, req.body.name)}" -C "${path.join(__dirname, 'servers')}"`, (e) => res.json({ success: !e }));
});

// --- SOCKET.IO ---
io.on('connection', (s) => {
    s.emit('logs_history', mcServer.getRecentLogs());
    s.emit('status_change', mcServer.status);
    s.on('command', (c) => mcServer.sendCommand(c));
});

// --- ARRANQUE ---
server.listen(3000, () => console.log('Aether Panel V1.5.0 running on port 3000'));
