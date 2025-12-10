const socket = io();
let currentPath = '';
let wlData = []; 
let selectedVerData = null; // Variable para guardar la versión seleccionada antes de instalar

// --- 1. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Cargar información inicial
    fetch('/api/info').then(r => r.json()).then(d => {
        const sb = document.getElementById('sidebar-version-text');
        if(sb) sb.innerText = 'V' + (d.version || '1.0.0');
    });

    fetch('/api/network').then(r => r.json()).then(d => {
        const ipElem = document.getElementById('server-ip-display');
        if(ipElem) {
            const val = d.custom_domain ? `${d.custom_domain}:${d.port}` : `${d.ip}:${d.port}`;
            ipElem.innerText = val; 
            ipElem.dataset.fullIp = val;
        }
    }).catch(() => {});

    // Inicializar Whitelist
    loadWhitelist();

    // Restaurar Tema
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedDesign = localStorage.getItem('design_mode') || 'glass';
    updateThemeUI(savedTheme);
    setDesign(savedDesign);
});

// --- 2. UTILIDADES ---
function api(ep, body) { 
    return fetch('/api/' + ep, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
    })
    .then(r => r.json())
    .catch(err => console.error("API Error:", err)); 
}

function copyIP() { 
    const ip = document.getElementById('server-ip-display').dataset.fullIp;
    navigator.clipboard.writeText(ip).then(() => Toastify({text: '¡IP Copiada!', style:{background:'#10b981'}}).showToast()); 
}

function closeAllModals() { 
    document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none'); 
}

// --- 3. PESTAÑAS (TABS) ---
function setTab(t, btn) {
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
    
    const target = document.getElementById('tab-' + t);
    if(target) target.classList.add('active');
    
    // Activar botón (si se pasó el elemento o buscarlo por onclick)
    if (btn) {
        btn.classList.add('active');
    } else {
        const autoBtn = document.querySelector(`.nav-btn[onclick*="'${t}'"]`);
        if(autoBtn) autoBtn.classList.add('active');
    }

    // Acciones específicas por pestaña
    const actions = document.getElementById('header-actions');
    if(actions) {
        // Ocultar botones de start/stop si estamos en la pestaña Monitor (porque ya están grandes ahí)
        actions.style.opacity = (t === 'stats') ? '0' : '1';
        actions.style.pointerEvents = (t === 'stats') ? 'none' : 'auto';
    }

    if (t === 'console') setTimeout(() => { fitAddon.fit(); document.getElementById('console-input')?.focus(); }, 100);
    if (t === 'files') loadFileBrowser(''); 
    if (t === 'config') loadCfg(); 
    if (t === 'backups') loadBackups();
    if (t === 'whitelist') loadWhitelist();
}

// --- 4. TERMINAL (XTERM) ---
const term = new Terminal({ 
    fontFamily: 'JetBrains Mono, monospace', 
    theme: { background: '#00000000' }, 
    fontSize: 13, 
    cursorBlink: true, 
    convertEol: true 
});
const fitAddon = new FitAddon.FitAddon(); 
term.loadAddon(fitAddon); 
if(document.getElementById('terminal')) {
    term.open(document.getElementById('terminal'));
    term.writeln('\x1b[1;36m>>> AETHER PANEL CONECTADO.\x1b[0m\r\n');
}

window.addEventListener('resize', () => {
    if (document.getElementById('tab-console').classList.contains('active')) fitAddon.fit();
});

term.onData(d => socket.emit('command', d));
socket.on('console_data', d => term.write(d));
socket.on('logs_history', d => { term.write(d); setTimeout(() => fitAddon.fit(), 200); });

function sendConsoleCommand() { 
    const i = document.getElementById('console-input'); 
    if (i && i.value.trim()) { 
        socket.emit('command', i.value); 
        i.value = ''; 
    } 
}

// --- 5. GRÁFICOS (STATS) ---
let cpuChart, ramChart;
if(document.getElementById('cpuChart')) {
    cpuChart = new Chart(document.getElementById('cpuChart').getContext('2d'), { type:'line', data:{labels:Array(20).fill(''),datasets:[{data:Array(20).fill(0),borderColor:'#8b5cf6',backgroundColor:'#8b5cf615',fill:true,tension:0.4,pointRadius:0,borderWidth:2}]}, options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},scales:{x:{display:false},y:{min:0,max:100,grid:{display:false},ticks:{display:false}}},plugins:{legend:{display:false}}} });
    ramChart = new Chart(document.getElementById('ramChart').getContext('2d'), { type:'line', data:{labels:Array(20).fill(''),datasets:[{data:Array(20).fill(0),borderColor:'#3b82f6',backgroundColor:'#3b82f615',fill:true,tension:0.4,pointRadius:0,borderWidth:2}]}, options:{responsive:true,maintainAspectRatio:false,animation:{duration:0},scales:{x:{display:false},y:{min:0,grid:{display:false},ticks:{display:false}}},plugins:{legend:{display:false}}} });

    // Actualizar datos cada segundo
    setInterval(() => {
        fetch('/api/stats').then(r => r.json()).then(d => {
            // CPU
            cpuChart.data.datasets[0].data.shift(); 
            cpuChart.data.datasets[0].data.push(d.cpu); 
            cpuChart.update(); 
            document.getElementById('cpu-val').innerText = d.cpu.toFixed(1) + '%';
            if (d.cpu_freq > 0) document.getElementById('cpu-freq').innerText = (d.cpu_freq / 1000).toFixed(1) + ' GHz';
            
            // RAM
            const toGB = (b) => (b / 1073741824).toFixed(1);
            ramChart.options.scales.y.max = parseFloat(toGB(d.ram_total)); 
            ramChart.data.datasets[0].data.shift(); 
            ramChart.data.datasets[0].data.push(parseFloat(toGB(d.ram_used))); 
            ramChart.update();
            document.getElementById('ram-val').innerText = `${toGB(d.ram_used)} / ${toGB(d.ram_total)} GB`; 
            document.getElementById('ram-free').innerText = toGB(d.ram_free) + ' GB Libre';
            
            // DISCO
            document.getElementById('disk-val').innerText = (d.disk_used / 1048576).toFixed(0) + ' MB'; 
            document.getElementById('disk-fill').style.width = Math.min((d.disk_used / d.disk_total) * 100, 100) + '%';
        }).catch(() => {});
    }, 1000);
}

// Escuchar cambios de estado (Online/Offline)
socket.on('status_change', s => { 
    const w = document.getElementById('status-widget'); 
    if(w) { 
        w.className = 'status-widget ' + s; 
        document.getElementById('status-text').innerText = s; 
    } 
});

// --- FIX: TOAST NOTIFICATIONS (Backend Listener) ---
socket.on('toast', (data) => {
    let bg = '#333'; // Default
    if (data.type === 'success') bg = '#10b981';
    if (data.type === 'error')   bg = '#ef4444';
    if (data.type === 'warning') bg = '#f59e0b';
    if (data.type === 'info')    bg = '#8b5cf6';

    Toastify({
        text: data.msg,
        duration: 4000,
        gravity: "top", 
        position: "right", 
        style: { 
            background: bg,
            boxShadow: "0 10px 20px rgba(0,0,0,0.2)",
            borderRadius: "12px",
            fontWeight: "600"
        },
        stopOnFocus: true 
    }).showToast();
});


// --- 6. WHITELIST SYSTEM ---
function loadWhitelist() {
    fetch('/api/whitelist')
        .then(r => r.json())
        .then(data => {
            wlData = data;
            renderWL();
        })
        .catch(() => { wlData = []; renderWL(); });
}

function renderWL() {
    const grid = document.getElementById('wl-grid');
    const empty = document.getElementById('wl-empty');
    if(!grid) return;
    
    grid.innerHTML = '';
    
    if(!wlData || wlData.length === 0) {
        grid.style.display = 'none';
        if(empty) empty.style.display = 'flex';
        return;
    }
    
    grid.style.display = 'grid';
    if(empty) empty.style.display = 'none';
    
    wlData.forEach(user => {
        const div = document.createElement('div');
        div.className = 'wl-card';
        // Usamos minotar para el avatar, fallback a inicial si no hay internet
        div.innerHTML = `
            <img src="https://minotar.net/helm/${user.name}/36.png" class="wl-avatar" onerror="this.style.display='none'">
            <div class="wl-info">
                <div class="wl-name">${user.name}</div>
                <div class="wl-date">${user.date || 'Desconocido'}</div>
            </div>
            <button class="btn-wl-remove" onclick="removeWL('${user.name}')"><i class="fa-solid fa-trash"></i></button>
        `;
        grid.appendChild(div);
    });
}

function addWL() {
    const input = document.getElementById('wl-input');
    const name = input.value.trim();
    if(!name) return;
    
    // Optimistic UI update
    const today = new Date().toLocaleDateString();
    
    api('whitelist/add', { user: name }).then(res => {
        if(res.success) {
            loadWhitelist(); // Recargar la real del servidor
            Toastify({text: `Añadido: ${name}`, style:{background:"#10b981"}}).showToast();
            input.value = '';
        }
    });
}

function removeWL(name) {
    if(!confirm(`¿Eliminar a ${name}?`)) return;
    api('whitelist/remove', { user: name }).then(res => {
        if(res.success) {
            loadWhitelist();
            Toastify({text: `Eliminado: ${name}`, style:{background:"#ef4444"}}).showToast();
        }
    });
}

function handleWLKey(e) {
    if(e.key === 'Enter') addWL();
}

function toggleWL(state) {
    api('whitelist/toggle', { enabled: state }).then(() => {
        const msg = state ? "Whitelist Activada" : "Whitelist Desactivada";
        Toastify({text: msg, style:{background: state ? "#10b981" : "#ef4444"}}).showToast();
    });
}

// --- 7. APARIENCIA & CONFIG ---

function setTheme(mode) { 
    localStorage.setItem('theme', mode); 
    updateThemeUI(mode); 
}

function updateThemeUI(mode) {
    let apply = mode; 
    if (mode === 'auto') apply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', apply);
    
    document.querySelectorAll('.seg-item').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`theme-btn-${mode}`);
    if(btn) btn.classList.add('active');
    
    // Actualizar terminal color
    if (term) {
        term.options.theme = (apply === 'light') 
            ? { foreground: '#334155', background: '#ffffff', cursor: '#334155', selectionBackground: 'rgba(0,0,0,0.1)' }
            : { foreground: '#ffffff', background: 'transparent', cursor: '#ffffff', selectionBackground: 'rgba(255,255,255,0.2)' };
    }
}

function setDesign(mode) {
    document.documentElement.setAttribute('data-design', mode);
    localStorage.setItem('design_mode', mode);
    
    document.getElementById('modal-btn-glass')?.classList.toggle('active', mode === 'glass');
    document.getElementById('modal-btn-material')?.classList.toggle('active', mode === 'material');
}

function setAccentColor(color) {
    document.documentElement.style.setProperty('--p', color);
    document.documentElement.style.setProperty('--p-light', color + '80'); 
}

function setAccentMode(mode) {
    if(mode === 'auto') setAccentColor('#8b5cf6'); // Reset purple
}

// --- 8. FUNCIONES MOCK (Archivos, Updates, etc) ---

function loadFileBrowser(p) { currentPath = p; api('files?path='+p).then(data => {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    if(p) list.innerHTML += `<div class="file-row" onclick="loadFileBrowser('')"><span>..</span></div>`;
    data.forEach(f => {
        list.innerHTML += `<div class="file-row ${f.isDir?'folder':''}" onclick="${f.isDir ? `loadFileBrowser('${f.name}')` : ''}">
            <span><i class="fa-solid ${f.isDir?'fa-folder':'fa-file'}"></i> ${f.name}</span>
            <span>${f.size}</span>
        </div>`;
    });
});}

function uploadFile() {
    const i = document.createElement('input'); i.type='file'; 
    i.onchange = e => { 
        const fd = new FormData(); fd.append('file', e.target.files[0]);
        fetch('/api/files/upload', {method:'POST', body:fd}).then(() => loadFileBrowser(currentPath));
    };
    i.click();
}

function loadCfg() { api('config').then(d => {
    const c = document.getElementById('cfg-list'); c.innerHTML = '';
    Object.entries(d).forEach(([k,v]) => {
        c.innerHTML += `<div class="cfg-item"><label class="cfg-label">${k}</label><input class="cfg-in" value="${v}" onchange="saveCfgSingle('${k}', this.value)"></div>`;
    });
});}

function checkUpdate() { Toastify({text: "Buscando actualizaciones...", style:{background:"var(--p)"}}).showToast(); setTimeout(() => Toastify({text: "Sistema actualizado", style:{background:"#10b981"}}).showToast(), 1500); }
function forceUIUpdate() { location.reload(); }
function createBackup() { api('backups/create').then(() => loadBackups()); }
function loadBackups() { api('backups').then(d => { document.getElementById('backup-list').innerHTML = d.map(b => `<div class="file-row"><span>${b.name}</span><span>${b.size}</span></div>`).join(''); }); }


// --- 9. SISTEMA DE VERSIONES E INSTALACIÓN (IMPLEMENTADO) ---

function loadVersions(type) {
    Toastify({text: "Obteniendo versiones...", style:{background:"var(--p)"}}).showToast();
    
    api('nebula/versions', { type }).then(data => {
        const list = document.getElementById('version-list');
        list.innerHTML = '';
        
        if(!data || data.length === 0) {
            list.innerHTML = '<p style="color:var(--muted); grid-column: 1/-1; text-align:center;">No se encontraron versiones disponibles.</p>';
            return;
        }

        data.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.cssText = 'justify-content: space-between; font-family: "JetBrains Mono"; font-size: 0.9rem;';
            
            // v.id es la versión (ej: "1.20.4")
            btn.innerHTML = `<span>${v.id}</span> <i class="fa-solid fa-cloud-arrow-down"></i>`;
            
            btn.onclick = () => {
                // Guardamos la info y abrimos el modal de RAM
                selectedVerData = { ...v, type }; // Guardamos tipo y version
                document.getElementById('version-modal').style.display = 'none';
                document.getElementById('ram-modal').style.display = 'flex';
                
                // Actualizar texto visual del modal RAM
                document.querySelector('#ram-modal h3').innerHTML = `<i class="fa-solid fa-microchip"></i> Instalar ${type} ${v.id}`;
            };
            
            list.appendChild(btn);
        });

        document.getElementById('version-modal').style.display = 'flex';
    }).catch(err => {
        console.error(err);
        Toastify({text: "Error al conectar con la API de versiones", style:{background:"#ef4444"}}).showToast();
    });
}

function confirmInstall() {
    if (!selectedVerData) return;
    
    // 1. Obtener RAM del slider
    const ramVal = document.getElementById('ram-slider').value;
    const ramStr = ramVal + "G";
    
    // 2. Cerrar modal y notificar
    document.getElementById('ram-modal').style.display = 'none';
    Toastify({text: `Configurando ${ramStr} RAM e instalando...`, style:{background:"var(--p)"}}).showToast();
    
    // 3. Guardar RAM primero
    api('settings', { ram: ramStr }).then(() => {
        
        // 4. Resolver URL de descarga según el tipo
        const type = selectedVerData.type;
        const ver = selectedVerData.id;
        
        // Función helper para enviar la orden de instalación al backend
        const sendInstall = (url, filename) => {
            api('install', { url, filename }).then(res => {
                if(!res.success) Toastify({text: "Error al iniciar instalación", style:{background:"#ef4444"}}).showToast();
            });
        };

        if (type === 'vanilla') {
            api('nebula/resolve-vanilla', { url: selectedVerData.url }).then(res => {
                if(res.url) sendInstall(res.url, 'server.jar');
            });
        } 
        else if (type === 'paper') {
            // Resolver última build de Paper dinámicamente
            fetch(`https://api.papermc.io/v2/projects/paper/versions/${ver}`)
                .then(r => r.json())
                .then(d => {
                    if(!d.builds) { Toastify({text: "Error al obtener builds de Paper", style:{background:"#ef4444"}}).showToast(); return; }
                    const latestBuild = d.builds[d.builds.length - 1];
                    const jarName = `paper-${ver}-${latestBuild}.jar`;
                    const url = `https://api.papermc.io/v2/projects/paper/versions/${ver}/builds/${latestBuild}/downloads/${jarName}`;
                    sendInstall(url, 'server.jar');
                });
        } 
        else if (type === 'fabric') {
            // Resolver loader estable de Fabric
            fetch('https://meta.fabricmc.net/v2/versions/loader')
                .then(r => r.json())
                .then(d => {
                    const stableLoader = d.find(l => l.stable).version;
                    const url = `https://meta.fabricmc.net/v2/versions/loader/${ver}/${stableLoader}/server/jar`;
                    sendInstall(url, 'server.jar');
                });
        } 
        else if (type === 'forge') {
            api('nebula/resolve-forge', { version: ver }).then(res => {
                if(res.url) sendInstall(res.url, 'server.jar'); // El manager lo renombra si es installer
                else Toastify({text: "No se encontró instalador para esta versión", style:{background:"#ef4444"}}).showToast();
            });
        }
    });
}

function openModStore() {
    Toastify({text: "La tienda de mods estará disponible en la V1.7.0", style:{background:"#3b82f6"}}).showToast();
}
