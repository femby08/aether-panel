const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuración
app.use(express.static(__dirname)); // Sirve tus archivos HTML/CSS/JS actuales
app.use(express.json());

// --- ESTADO SIMULADO ---
let serverStatus = 'OFFLINE';
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');

// --- RUTAS API ---

// 1. Info básica
app.get('/api/info', (req, res) => res.json({ version: '1.6.0-Standalone' }));
app.get('/api/network', (req, res) => res.json({ ip: '127.0.0.1', port: 25565 }));

// 2. Control de Energía (Simulación)
app.post('/api/power/start', (req, res) => {
    if (serverStatus !== 'OFFLINE') return res.json({ success: false });
    
    serverStatus = 'STARTING';
    io.emit('status_change', 'STARTING');
    io.emit('console_data', '\x1b[33m[System] Iniciando secuencia de arranque...\r\n');
    
    // Simular carga (3 segundos)
    setTimeout(() => {
        io.emit('console_data', '[Server] Cargando librerias, espera...\r\n');
    }, 1500);

    setTimeout(() => {
        serverStatus = 'ONLINE';
        io.emit('status_change', 'ONLINE');
        io.emit('console_data', '\x1b[32m[Server] Done! For help, type "help"\r\n');
    }, 3000);

    res.json({ success: true });
});

app.post('/api/power/stop', (req, res) => {
    if (serverStatus === 'OFFLINE') return res.json({ success: false });
    
    io.emit('console_data', '[Server] Stopping server...\r\n');
    setTimeout(() => {
        serverStatus = 'OFFLINE';
        io.emit('status_change', 'OFFLINE');
        io.emit('console_data', '\x1b[31m[System] Servidor detenido.\r\n');
    }, 1000);
    
    res.json({ success: true });
});

app.post('/api/power/restart', (req, res) => {
    io.emit('console_data', '[System] Reiniciando...\r\n');
    serverStatus = 'OFFLINE';
    io.emit('status_change', 'OFFLINE');
    setTimeout(() => {
        serverStatus = 'ONLINE';
        io.emit('status_change', 'ONLINE');
    }, 2000);
    res.json({ success: true });
});

app.post('/api/power/kill', (req, res) => {
    serverStatus = 'OFFLINE';
    io.emit('status_change', 'OFFLINE');
    io.emit('console_data', '\x1b[31m[System] Proceso eliminado (KILL).\r\n');
    res.json({ success: true });
});

// 3. Estadísticas Falsas
app.get('/api/stats', (req, res) => {
    let cpu = 0, ram = 0;
    if (serverStatus === 'ONLINE') {
        cpu = Math.random() * 15 + 5; // 5-20%
        ram = 1024 * 1024 * 1024 * 1.5; // 1.5 GB
    }
    res.json({
        cpu: cpu,
        cpu_freq: 3400,
        ram_used: ram,
        ram_total: 4 * 1024 * 1024 * 1024,
        ram_free: 2 * 1024 * 1024 * 1024,
        disk_used: 500 * 1024 * 1024,
        disk_total: 10 * 1024 * 1024 * 1024
    });
});

// 4. Whitelist (Persistente en archivo json)
app.get('/api/whitelist', (req, res) => {
    if (fs.existsSync(WHITELIST_FILE)) {
        res.json(JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8')));
    } else {
        res.json([]);
    }
});

app.post('/api/whitelist/add', (req, res) => {
    const { user } = req.body;
    let list = [];
    if (fs.existsSync(WHITELIST_FILE)) list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
    
    // Evitar duplicados
    if (!list.some(u => u.name === user)) {
        list.push({ name: user, date: new Date().toLocaleDateString() });
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify(list, null, 2));
        io.emit('console_data', `[Server] Added ${user} to the whitelist\r\n`);
    }
    res.json({ success: true });
});

app.post('/api/whitelist/remove', (req, res) => {
    const { user } = req.body;
    let list = [];
    if (fs.existsSync(WHITELIST_FILE)) list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
    
    list = list.filter(u => u.name !== user);
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(list, null, 2));
    io.emit('console_data', `[Server] Removed ${user} from the whitelist\r\n`);
    res.json({ success: true });
});

app.post('/api/whitelist/toggle', (req, res) => {
    const { enabled } = req.body;
    io.emit('console_data', `[Server] Whitelist is now ${enabled ? 'on' : 'off'}\r\n`);
    res.json({ success: true });
});

// APIs vacías para evitar errores de consola
app.get('/api/files', (req, res) => res.json([]));
app.get('/api/config', (req, res) => res.json({ 'server-port': 25565, 'motd': 'Aether Server' }));
app.get('/api/backups', (req, res) => res.json([]));

// SOCKET
io.on('connection', (socket) => {
    socket.emit('status_change', serverStatus);
    socket.on('command', (cmd) => {
        io.emit('console_data', `> ${cmd}\r\n`);
        if (serverStatus === 'ONLINE') {
            if(cmd.startsWith('whitelist')) {
                // Lógica simple para comandos por consola
                io.emit('console_data', `[Server] Whitelist command received.\r\n`);
            } else {
                io.emit('console_data', `[Server] Unknown command.\r\n`);
            }
        }
    });
});

// INICIAR
server.listen(3000, () => {
    console.log('PANEL LISTO: Entra en http://localhost:3000');
});
