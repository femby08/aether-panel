const socket = io();
let currentPath = '';

// Variables para Charts
let cpuChart, ramChart;
const MAX_DATA_POINTS = 20;

// Variables Globales
let whitelistData = ["Admin", "Moderator"]; 
let serverStatus = 'OFFLINE'; 
let SERVER_MODE = 'cracked'; 

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Xterm
    if(document.getElementById('terminal')) {
        try {
            term.open(document.getElementById('terminal'));
            term.loadAddon(fitAddon);
            term.writeln('\x1b[1;36m>>> AETHER PANEL.\x1b[0m\r\n');
            setTimeout(() => fitAddon.fit(), 200);
        } catch(e){}
    }

    // 2. Info Servidor
    fetch('package.json')
        .then(response => response.json())
        .then(data => {
            const el = document.getElementById('version-display');
            if (el && data.version) el.innerText = `v${data.version}`;
        })
        .catch(() => console.log('Error cargando versión'));

    // 3. Inicializar Sistemas
    setupNavigation();     // <--- IMPORTANTE: Activa el menú lateral
    setupPowerControls();  // Activa botones de encendido
    setupUIControls();     // Activa personalización y modales
    initCharts();
    
    // 4. Cargar Configuración Visual Guardada
    updateThemeUI(localStorage.getItem('theme') || 'dark');
    
    // 5. Loop de Datos
    refreshDashboardData();
    setInterval(refreshDashboardData, 3000);
});

// --- NAVEGACIÓN DEL MENÚ LATERAL ---
function setupNavigation() {
    // Busca todos los botones del menú (Monitor, Consola, etc.)
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Evitar comportamiento por defecto
            e.preventDefault();
            
            // Obtener el ID de la pestaña (ej: 'stats', 'console') desde el atributo onclick o ID
            // Asumimos que el HTML es algo como id="nav-stats"
            const targetId = btn.id.replace('nav-', '');
            
            if(targetId) setTab(targetId);
        });
    });

    // Asegurar que la primera pestaña (Monitor) esté activa al inicio
    setTab('stats');
}

function setTab(tabName) {
    // 1. Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none'; // Asegurar ocultamiento
    });
    
    // 2. Desactivar todos los botones del menú
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // 3. Mostrar el contenido seleccionado
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) {
        targetContent.style.display = 'flex'; // O 'block' dependiendo del diseño
        // Pequeño timeout para permitir la animación CSS si existe
        setTimeout(() => targetContent.classList.add('active'), 10);
    }

    // 4. Activar el botón correspondiente
    const targetBtn = document.getElementById(`nav-${tabName}`);
    if (targetBtn) targetBtn.classList.add('active');

    // Lógicas específicas de cada pestaña
    if(tabName === 'console' && typeof fitAddon !== 'undefined') setTimeout(() => fitAddon.fit(), 100);
    if(tabName === 'config') loadConfig();
}

// --- CONTROLES DE INTERFAZ (PERSONALIZAR) ---
function setupUIControls() {
    // Botón flotante "Personalizar"
    const btnCustomize = document.querySelector('.btn-customize') || document.getElementById('btn-personalizar');
    if(btnCustomize) {
        btnCustomize.onclick = () => {
            // Aquí puedes abrir un modal o ir a la pestaña de ajustes
            // Si tienes un modal de personalización:
            const modal = document.getElementById('customize-modal');
            if(modal) modal.classList.add('active');
            else showToast("Función de personalizar UI en desarrollo", "info");
        };
    }

    // Cerrar modales al hacer clic fuera (overlay)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if(e.target === overlay) closeAllModals();
        });
    });
}

// --- CONTROLES DE ENERGÍA ---
function setupPowerControls() {
    // Vinculación manual si los IDs no coinciden o para asegurar
    const actions = {
        'btn-start': startServer,
        'btn-restart': restartServer,
        'btn-stop': stopServer,
        'btn-kill': killServer
    };

    Object.keys(actions).forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.onclick = actions[id];
    });
}

// Funciones globales de servidor
window.startServer = function() {
    if(serverStatus === 'ONLINE') return showToast("El servidor ya está online", "info");
    serverStatus = 'STARTING';
    updateServerStatusUI();
    showToast("Iniciando servidor...", "info");
    setTimeout(() => {
        serverStatus = 'ONLINE';
        updateServerStatusUI();
        showToast("¡Servidor en línea!", "success");
    }, 2000);
}

window.restartServer = function() {
    serverStatus = 'RESTARTING';
    updateServerStatusUI();
    showToast("Reiniciando...", "warning");
    setTimeout(() => {
        serverStatus = 'ONLINE';
        updateServerStatusUI();
    }, 3000);
}

window.stopServer = function() {
    if(serverStatus === 'OFFLINE') return;
    serverStatus = 'STOPPING';
    updateServerStatusUI();
    showToast("Deteniendo...", "error");
    setTimeout(() => {
        serverStatus = 'OFFLINE';
        updateServerStatusUI();
    }, 1500);
}

window.killServer = function() {
    if(!confirm("¿Forzar apagado?")) return;
    serverStatus = 'OFFLINE';
    updateServerStatusUI();
    showToast("Proceso terminado (KILL)", "error");
}

function updateServerStatusUI() {
    const text = document.querySelector('.status-text') || document.querySelector('.status-widget span');
    const indicator = document.querySelector('.status-indicator');
    
    if(text && indicator) {
        text.innerText = serverStatus;
        indicator.style.background = serverStatus === 'ONLINE' ? 'var(--success)' : (serverStatus === 'OFFLINE' ? 'var(--danger)' : 'var(--warning)');
        indicator.style.boxShadow = serverStatus === 'ONLINE' ? '0 0 10px var(--success)' : 'none';
        
        // Animación de botones (opcional)
        const btnStart = document.getElementById('btn-start');
        const btnStop = document.getElementById('btn-stop');
        if(btnStart) btnStart.disabled = serverStatus === 'ONLINE';
        if(btnStop) btnStop.disabled = serverStatus === 'OFFLINE';
    }
}

// --- CONFIGURACIÓN & WHITELIST ---
function loadConfig() {
    // Simular carga de API
    api('config').then(data => {
        // Fallback si no hay datos
        if(!data || Object.keys(data).length === 0 || data.success) {
             data = { "server-port": 25565, "online-mode": "false", "motd": "Minecraft Server", "max-players": 20 };
        }
        renderConfigForm(data);
        renderWhitelist();
    }).catch(() => {
        // Si falla (normal en preview), renderizamos datos por defecto
        renderConfigForm({ "server-port": 25565, "online-mode": "false", "motd": "A Minecraft Server", "max-players": 20 });
        renderWhitelist();
    });
}

function renderConfigForm(data) {
    const container = document.getElementById('cfg-list');
    if(!container) return;

    let html = '<h3 class="section-label">Propiedades</h3><div class="cfg-grid">';
    Object.entries(data).forEach(([key, value]) => {
        html += `
        <div class="cfg-item">
            <label class="cfg-label">${key}</label>
            <input class="cfg-in" data-key="${key}" value="${value}">
        </div>`;
    });
    html += '</div>';

    // Sección Whitelist
    html += `
    <div class="whitelist-container">
        <div class="whitelist-header">
            <h3 class="section-label" style="margin:0">Gestión de Whitelist</h3>
            <div class="whitelist-input-group">
                <input type="text" id="wl-add-input" class="cfg-in" placeholder="Usuario" style="width:150px">
                <button class="btn btn-primary" style="padding:5px 15px" onclick="addWhitelistUser()">+</button>
            </div>
        </div>
        <div id="whitelist-grid" class="whitelist-grid"></div>
    </div>
    <div style="margin-top:20px; text-align:right">
        <button class="btn btn-primary" onclick="saveConfig()">Guardar Todo</button>
    </div>`;
    
    container.innerHTML = html;
}

window.addWhitelistUser = function() {
    const input = document.getElementById('wl-add-input');
    if(input && input.value.trim()) {
        const name = input.value.trim();
        if(!whitelistData.includes(name)) {
            whitelistData.push(name);
            renderWhitelist();
            showToast(`${name} añadido`, "success");
        }
        input.value = '';
    }
}

window.removeWhitelistUser = function(name) {
    whitelistData = whitelistData.filter(u => u !== name);
    renderWhitelist();
    showToast(`${name} eliminado`, "info");
}

function renderWhitelist() {
    const grid = document.getElementById('whitelist-grid');
    if(!grid) return;
    
    if(whitelistData.length === 0) {
        grid.innerHTML = '<span style="color:var(--muted); font-size:0.8rem">Lista vacía</span>';
        return;
    }

    let html = '';
    whitelistData.forEach(user => {
        html += `
        <div class="player-chip">
            <div class="chip-avatar" style="background:#3b82f6">${user.charAt(0)}</div>
            <span>${user}</span>
            <i class="fa-solid fa-xmark chip-remove" onclick="removeWhitelistUser('${user}')"></i>
        </div>`;
    });
    grid.innerHTML = html;
}

window.saveConfig = function() {
    showToast("Configuración guardada correctamente", "success");
    // Aquí iría la llamada real a la API
}

// --- CHART SYSTEM ---
function initCharts() {
    // Asegurarse de que Chart.js esté cargado
    if(typeof Chart === 'undefined') return;

    const ctxCpu = document.getElementById('cpuChart') || document.getElementById('cpu-chart');
    if(ctxCpu) {
        const grad = ctxCpu.getContext('2d').createLinearGradient(0, 0, 0, 100);
        grad.addColorStop(0, 'rgba(139, 92, 246, 0.5)'); grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
        
        cpuChart = new Chart(ctxCpu, {
            type: 'line',
            data: { 
                labels: Array(MAX_DATA_POINTS).fill(''), 
                datasets: [{ data: Array(MAX_DATA_POINTS).fill(0), borderColor: '#8b5cf6', backgroundColor: grad, fill: true, tension: 0.4 }] 
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }, elements: { point: { radius: 0 } } }
        });
    }

    const ctxRam = document.getElementById('ramChart') || document.getElementById('ram-chart');
    if(ctxRam) {
        const grad = ctxRam.getContext('2d').createLinearGradient(0, 0, 0, 100);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.5)'); grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
        
        ramChart = new Chart(ctxRam, {
            type: 'line',
            data: { 
                labels: Array(MAX_DATA_POINTS).fill(''), 
                datasets: [{ data: Array(MAX_DATA_POINTS).fill(0), borderColor: '#06b6d4', backgroundColor: grad, fill: true, tension: 0.4 }] 
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }, elements: { point: { radius: 0 } } }
        });
    }
}

function updateChart(chart, val) {
    if(chart) {
        chart.data.datasets[0].data.push(val);
        chart.data.datasets[0].data.shift();
        chart.update('none'); // 'none' para mejor performance
    }
}

// --- DASHBOARD DATA ---
async function refreshDashboardData() {
    // Simulación de datos para que veas movimiento
    let cpu = 0, ram = 0;
    
    if(serverStatus === 'ONLINE') {
        cpu = Math.floor(Math.random() * 50) + 10;
        ram = Math.floor(Math.random() * 30) + 20;
    }

    // Actualizar Textos UI
    updateStatText('cpu-chart', cpu + '%');
    updateStatText('ram-chart', (ram/10).toFixed(1) + ' GB');

    // Actualizar Gráficas
    if(cpuChart) updateChart(cpuChart, cpu);
    if(ramChart) updateChart(ramChart, ram);
}

function updateStatText(chartId, text) {
    const el = document.getElementById(chartId);
    if(el) {
        // Buscar el contenedor padre y luego el texto grande
        const statBox = el.closest('.card')?.querySelector('.stat-big');
        if(statBox) statBox.innerText = text;
    }
}

// Utils
function api(ep, body){ return fetch('/api/'+ep, {method:'POST', body:JSON.stringify(body)}).then(r=>r.ok?r.json():Promise.reject()); }
function closeAllModals() { document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active')); }
function updateThemeUI(t) { document.body.setAttribute('data-theme', t); }
function showToast(msg, type='info') {
    if(typeof Toastify !== 'undefined') {
        const colors = { info: "#3b82f6", success: "#10b981", warning: "#f59e0b", error: "#ef4444" };
        Toastify({ text: msg, duration: 3000, style: { background: colors[type] } }).showToast();
    } else { console.log(msg); }
}
