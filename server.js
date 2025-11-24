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
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const upload = multer({ dest: os.tmpdir() });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// GESTOR Y CONFIGURACIÓN
const mcServer = new MCManager(io);
const SERVER_DIR = path.join(__dirname, 'servers', 'default');
const BACKUP_DIR = path.join(__dirname, 'backups');
const LOCAL_VERSION = require('./package.json').version;

// --- CONFIGURACIÓN DE GITHUB ---
// 1. Dónde mirar la versión (En la raíz del repo)
const REPO_VERSION_URL = 'https://raw.githubusercontent.com/reychampi/nebula/main/package.json';
// 2. Dónde descargar el código
const REPO_ZIP_URL = 'https://github.com/reychampi/nebula/archive/refs/heads/main.zip';

// --- SISTEMA DE ACTUALIZACIÓN ---
app.get('/api/update/check', async (req, res) => {
    try {
        // Consultar GitHub
        const r = await axios.get(REPO_VERSION_URL);
        const remoteVer = r.data.version;
        
        // Si la versión de GitHub es distinta a la local...
        if (remoteVer !== LOCAL_VERSION) {
            res.json({ update: true, local: LOCAL_VERSION, remote: remoteVer });
        } else {
            res.json({ update: false });
        }
    } catch (e) {
        console.error("Error checking GitHub:", e.message);
        res.json({ update: false, error: true });
    }
});

app.post('/api/update/schedule', (req, res) => {
    const { when } = req.body;
    if (when === 'now') {
        performUpdate();
        res.json({ success: true, msg: 'Actualizando sistema...' });
    } else if (when === 'stop') {
        mcServer.setUpdatePending(true, () => performUpdate());
        res.json({ success: true, msg: 'Actualización programada al apagar.' });
    }
});

function performUpdate() {
    io.emit('toast', { type: 'warning', msg: '⚡ Descargando actualización desde GitHub...' });
    
    // COMANDO INTELIGENTE:
    // 1. Descarga el ZIP de la rama main
    // 2. Descomprime
    // 3. Mueve el contenido de la carpeta descomprimida (nebula-main) a /opt/aetherpanel
    // 4. Instala dependencias nuevas si las hay
    // 5. Reinicia
    
    const cmd = `
        wget ${REPO_ZIP_URL} -O /tmp/update.zip && \
        unzip -o /tmp/update.zip -d /tmp/nebula_update && \
        cp -r /tmp/nebula_update/nebula-main/* /opt/aetherpanel/ && \
        rm -rf /tmp/update.zip /tmp/nebula_update && \
        cd /opt/aetherpanel && \
        npm install && \
        systemctl restart aetherpanel
    `;
    
    exec(cmd, (err) => {
        if (err) {
            console.error(err);
            io.emit('toast', { type: 'error', msg: 'Error crítico en actualización.' });
        }
    });
}

// --- PROXY DE VERSIONES NEBULA ---
app.post('/api/nebula/versions', async (req, res) => {
    const { type } = req.body;
    try {
        let list = [];
        if (type === 'vanilla') {
            const r = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
            list = r.data.versions.filter(v => v.type === 'release').map(v => ({ id: v.id, url: v.url, type: 'vanilla' }));
        } else if (type === 'paper') {
            const r = await axios.get('https://api.papermc.io/v2/projects/paper');
            list = r.data.versions.reverse().map(v => ({ id: v, type: 'paper' }));
        } else if (type === 'purpur') {
            const r = await axios.get('https://api.purpurmc.org/v2/purpur');
            list = r.data.versions.reverse().map(v => ({ id: v, type: 'purpur' }));
        } else if (type === 'fabric') {
            const r = await axios.get('https://meta.fabricmc.net/v2/versions/game');
            list = r.data.filter(v => v.stable).map(v => ({ id: v.version, type: 'fabric' }));
        } else if (type === 'forge') {
            const r = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const promos = r.data.promos;
            const versionsSet = new Set();
            Object.keys(promos).forEach(key => { const ver = key.split('-')[0]; if(ver.match(/^\d+\.\d+(\.\d+)?$/)) versionsSet.add(ver); });
            list = Array.from(versionsSet).sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })).map(v => ({ id: v, type: 'forge' }));
        }
        res.json(list);
    } catch (error) { res.status(500).json({ error: "API Error" }); }
});

app.post('/api/nebula/resolve-vanilla', async (req, res) => {
    try { const r = await axios.get(req.body.url); res.json({ url: r.data.downloads.server.url }); } catch (e) { res.status(500).json({error: 'Error resolving'}); }
});

// --- MONITORIZACIÓN ---
app.get('/api/stats', (req, res) => {
    osUtils.cpuUsage((cpu) => {
        let diskUsed = 0; try { fs.readdirSync(SERVER_DIR).forEach(file => { try { diskUsed += fs.statSync(path.join(SERVER_DIR, file)).size; } catch {} }); } catch {}
        res.json({ cpu: cpu * 100, ram_used: (os.totalmem() - os.freemem()) / 1024 / 1024, ram_total: os.totalmem() / 1024 / 1024, disk_used: diskUsed / 1024 / 1024, disk_total: 20480 });
    });
});

// --- RUTAS BÁSICAS ---
app.get('/api/status', (req, res) => res.json(mcServer.getStatus()));
app.post('/api/power/:action', async (req, res) => { try { if(mcServer[req.params.action]) await mcServer[req.params.action](); res.json({success:true}); } catch (e) { res.status(500).json({error:e.message}); }});
app.get('/api/config', (req, res) => res.json(mcServer.readProperties()));
app.post('/api/config', (req, res) => { mcServer.writeProperties(req.body); res.json({success:true}); });
app.post('/api/install', async (req, res) => { try { await mcServer.installJar(req.body.url, req.body.filename); res.json({success:true}); } catch (e) { res.status(500).json({error:e.message}); }});
app.get('/api/files', (req, res) => { const t = path.join(SERVER_DIR, (req.query.path||'').replace(/\.\./g, '')); if (!fs.existsSync(t)) return res.json([]); res.json(fs.readdirSync(t, {withFileTypes:true}).map(f => ({ name: f.name, isDir: f.isDirectory(), size: f.isDirectory()?'-':(fs.statSync(path.join(t,f.name)).size/1024).toFixed(1)+' KB'})).sort((a,b)=>a.isDir===b.isDir?0:a.isDir?-1:1)); });
app.post('/api/files/read', (req, res) => { const p = path.join(SERVER_DIR, req.body.file.replace(/\.\./g,'')); if(fs.existsSync(p)) res.json({content:fs.readFileSync(p,'utf8')}); else res.status(404).json({error:'404'}); });
app.post('/api/files/save', (req, res) => { fs.writeFileSync(path.join(SERVER_DIR, req.body.file.replace(/\.\./g,'')), req.body.content); res.json({success:true}); });
app.post('/api/files/upload', upload.single('file'), (req, res) => { if(req.file) { fs.renameSync(req.file.path, path.join(SERVER_DIR, req.file.originalname)); res.json({success:true}); } else res.json({success:false}); });
app.get('/api/backups', (req, res) => { if(!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR); res.json(fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith('.tar.gz')).map(f=>({name:f, size:(fs.statSync(path.join(BACKUP_DIR,f)).size/1024/1024).toFixed(2)+' MB'}))); });
app.post('/api/backups/create', (req, res) => { exec(`tar -czf "${path.join(BACKUP_DIR, 'backup-'+Date.now()+'.tar.gz')}" -C "${path.join(__dirname,'servers')}" default`, (e)=>res.json({success:!e})); });
app.post('/api/backups/delete', (req, res) => { fs.unlinkSync(path.join(BACKUP_DIR, req.body.name)); res.json({success:true}); });
app.post('/api/backups/restore', async (req, res) => { await mcServer.stop(); exec(`rm -rf "${SERVER_DIR}"/* && tar -xzf "${path.join(BACKUP_DIR, req.body.name)}" -C "${path.join(__dirname,'servers')}"`, (e)=>res.json({success:!e})); });

io.on('connection', (socket) => {
    socket.emit('logs_history', mcServer.getRecentLogs());
    socket.emit('status_change', mcServer.status);
    socket.on('command', (cmd) => mcServer.sendCommand(cmd));
});

server.listen(3000, () => console.log('Nebula V1.1 running'));
