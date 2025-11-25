const socket = io();
let currentPath = '', currentFile = '', allVersions = [];

// --- 1. OBTENER VERSIÓN INSTALADA ---
fetch('/api/info').then(r => r.json()).then(d => {
    // Actualiza los textos de versión en la interfaz
    const sidebarVer = document.getElementById('sidebar-version-text');
    const headerVer = document.getElementById('header-version');
    if (sidebarVer) sidebarVer.innerText = 'V' + d.version;
    if (headerVer) headerVer.innerText = 'V' + d.version;
});

// --- 2. GESTIÓN DE TEMAS ---
function setTheme(mode) {
    localStorage.setItem('theme', mode);
    updateThemeUI(mode);
}

function updateThemeUI(mode) {
    let apply = mode;
    if (mode === 'auto') {
        apply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', apply);
    
    // Actualizar estado de los botones
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.theme-btn[onclick="setTheme('${mode}')"]`);
    if (btn) btn.classList.add('active');
}

// Inicializar tema guardado
updateThemeUI(localStorage.getItem('theme') || 'dark');

// --- 3. SISTEMA DE ACTUALIZACIONES ---

// Auto-check al cargar la página
checkUpdate(true);

function checkUpdate(isAuto = false) {
    if (!isAuto) {
        Toastify({ text: 'Buscando actualizaciones...', style: { background: 'var(--p)' } }).showToast();
    }

    fetch('/api/update/check').then(r => r.json()).then(d => {
        if (d.type !== 'none') {
            showUpdateModal(d);
        } else if (!isAuto) {
            Toastify({ text: 'El sistema está actualizado.', style: { background: '#10b981' } }).showToast();
        }
    }).catch(e => {
        if (!isAuto) Toastify({ text: 'Error conectando con GitHub', style: { background: '#ef4444' } }).showToast();
    });
}

function showUpdateModal(d) {
    const modal = document.getElementById('update-modal');
    const title = document.getElementById('up-title');
    const text = document.getElementById('update-text');
    const actions = document.getElementById('up-actions');

    if (d.type === 'hard') {
        title.innerText = "Actualización Mayor";
        text.innerHTML = `Versión local: <b>${d.local}</b><br>Nueva versión: <b>${d.remote}</b><br><br>Se requiere reinicio del servidor.`;
        actions.innerHTML = `
            <button onclick="doUpdate('hard')" class="btn btn-primary">ACTUALIZAR SISTEMA</button>
            <button onclick="document.getElementById('update-modal').style.display='none'" class="btn btn-ghost">Cancelar</button>
        `;
        modal.style.display = 'flex';
    } else if (d.type === 'soft') {
        title.innerText = "Mejora Visual";
        text.innerHTML = `Se han detectado mejoras visuales en la versión <b>${d.local}</b>.<br>Se aplicarán sin reiniciar.`;
        actions.innerHTML = `
            <button onclick="doUpdate('soft')" class="btn" style="background:#10b981;color:white">APLICAR HOTFIX</button>
            <button onclick="document.getElementById('update-modal').style.display='none'" class="btn btn-ghost">Cancelar</button>
        `;
        modal.style.display = 'flex';
    }
}

function doUpdate(type) {
    document.getElementById('update-modal').style.display = 'none';
    
    fetch('/api/update/perform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
    }).then(r => r.json()).then(d => {
        if (d.mode === 'soft') {
            Toastify({ text: 'Interfaz actualizada. Recargando...', style: { background: '#10b981' } }).showToast();
            setTimeout(() => location.reload(), 1500);
        }
        if (d.mode === 'hard') {
            Toastify({ text: 'Iniciando actualización... espera 10s', duration: 10000, style: { background: '#f59e0b' } }).showToast();
            // Damos tiempo al script updater.sh para matar el proceso node y arrancar de nuevo
            setTimeout(() => location.reload(), 8000);
        }
    });
}

// --- 4. GRÁFICAS (Chart.js) ---
const createChart = (ctx, color) => new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            data: Array(20).fill(0),
            borderColor: color,
            backgroundColor: color + '15',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
            x: { display: false },
            y: { min: 0, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }
});

const cpuChart = createChart(document.getElementById('cpuChart').getContext('2d'), '#8b5cf6');
const ramChart = createChart(document.getElementById('ramChart').getContext('2d'), '#3b82f6');

// Loop de estadísticas (1s)
setInterval(() => {
    fetch('/api/stats').then(r => r.json()).then(d => {
        // CPU
        cpuChart.data.datasets[0].data.shift();
        cpuChart.data.datasets[0].data.push(d.cpu);
        cpuChart.update();
        document.getElementById('cpu-val').innerText = d.cpu.toFixed(1) + '%';

        // RAM
        ramChart.data.datasets[0].data.shift();
        ramChart.data.datasets[0].data.push(d.ram_used);
        ramChart.options.scales.y.max = d.ram_total;
        ramChart.update();
        document.getElementById('ram-val').innerText = `${d.ram_used.toFixed(0)} MB`;

        // DISCO
        document.getElementById('disk-val').innerText = d.disk_used.toFixed(0) + ' MB';
        const diskPercent = Math.min((d.disk_used / d.disk_total) * 100, 100);
        document.getElementById('disk-fill').style.width = diskPercent + '%';
    }).catch(() => {});
}, 1000);

// --- 5. TERMINAL (Xterm.js) ---
const term = new Terminal({
    fontFamily: 'JetBrains Mono, monospace',
    theme: { background: '#00000000' },
    fontSize: 13
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));

window.addEventListener('resize', () => {
    if (document.getElementById('tab-console').classList.contains('active')) fitAddon.fit();
});

term.onData(d => socket.emit('command', d));

// Socket Events
socket.on('console_data', d => term.write(d));
socket.on('logs_history', d => {
    term.write(d);
    setTimeout(() => fitAddon.fit(), 200);
});
socket.on('status_change', s => {
    const widget = document.getElementById('status-widget');
    if (widget) {
        widget.className = 'status-widget ' + s;
        document.getElementById('status-text').innerText = s;
    }
});
socket.on('toast', d => {
    const colors = { 'error': '#ef4444', 'success': '#10b981', 'warning': '#f59e0b', 'info': '#3b82f6' };
    Toastify({
        text: d.msg,
        duration: 3000,
        style: { background: colors[d.type] || '#3b82f6' }
    }).showToast();
});

// --- 6. NAVEGACIÓN ---
function setTab(tabName, btnElement) {
    // Ocultar tabs
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    // Desactivar botones
    document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
    
    // Activar selección
    document.getElementById('tab-' + tabName).classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    // Lógica específica por pestaña
    if (tabName === 'console') setTimeout(() => fitAddon.fit(), 100);
    if (tabName === 'files') loadFileBrowser('');
    if (tabName === 'config') loadConfig();
    if (tabName === 'backups') loadBackups();
}

function api(endpoint, body) {
    return fetch('/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(r => r.json());
}

// --- 7. GESTOR DE VERSIONES ---
async function loadVersions(type) {
    const modal = document.getElementById('version-modal');
    const list = document.getElementById('version-list');
    const loading = document.getElementById('loading-text');
    
    modal.style.display = 'flex';
    list.innerHTML = '';
    loading.style.display = 'inline';
    
    try {
        allVersions = await api('nebula/versions', { type });
        renderVersions(allVersions);
    } catch (e) {
        Toastify({ text: 'Error obteniendo versiones', style: { background: '#ef4444' } }).showToast();
    }
    loading.style.display = 'none';
}

function renderVersions(list) {
    const grid = document.getElementById('version-list');
    grid.innerHTML = '';
    list.forEach(v => {
        const el = document.createElement('div');
        el.className = 'version-item';
        el.innerHTML = `<h4>${v.id}</h4><span>${v.type}</span>`;
        el.onclick = () => installVersion(v);
        grid.appendChild(el);
    });
}

document.getElementById('version-search').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    renderVersions(allVersions.filter(v => v.id.toLowerCase().includes(term)));
};

async function installVersion(v) {
    if (!confirm(`¿Instalar ${v.type} ${v.id}? Esto eliminará el núcleo actual.`)) return;
    document.getElementById('version-modal').style.display = 'none';
    
    let url = '';
    try {
        if (v.type === 'vanilla') {
            const res = await api('nebula/resolve-vanilla', { url: v.url });
            url = res.url;
        } 
        else if (v.type === 'paper') {
            const r = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${v.id}`);
            const d = await r.json();
            const b = d.builds[d.builds.length - 1];
            url = `https://api.papermc.io/v2/projects/paper/versions/${v.id}/builds/${b}/downloads/paper-${v.id}-${b}.jar`;
        }
        else if (v.type === 'fabric') {
            const r = await fetch('https://meta.fabricmc.net/v2/versions/loader');
            const d = await r.json();
            url = `https://meta.fabricmc.net/v2/versions/loader/${v.id}/${d[0].version}/1.0.0/server/jar`;
        }
        else if (v.type === 'forge') {
            url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${v.id}-${v.id}/forge-${v.id}-${v.id}-universal.jar`;
            Toastify({ text: 'Intentando descarga directa Forge...', style: { background: '#f39c12' } }).showToast();
        }

        if (url) api('install', { url, filename: 'server.jar' });
    } catch (e) {
        Toastify({ text: 'Error al resolver enlace de descarga', style: { background: '#ef4444' } }).showToast();
    }
}

// --- 8. GESTOR DE ARCHIVOS ---
function loadFileBrowser(p) {
    currentPath = p;
    document.getElementById('file-breadcrumb').innerText = '/root' + (p ? '/' + p : '');
    
    api('files?path=' + encodeURIComponent(p)).then(files => {
        const list = document.getElementById('file-list');
        list.innerHTML = '';
        
        if (p) {
            const back = document.createElement('div');
            back.className = 'file-row';
            back.innerHTML = '<span><i class="fa-solid fa-arrow-turn-up"></i> ..</span>';
            back.onclick = () => {
                const arr = p.split('/');
                arr.pop();
                loadFileBrowser(arr.join('/'));
            };
            list.appendChild(back);
        }

        files.forEach(f => {
            const el = document.createElement('div');
            el.className = 'file-row';
            el.innerHTML = `<span><i class="fa-solid ${f.isDir ? 'fa-folder' : 'fa-file'}" style="color:${f.isDir ? 'var(--p)' : 'var(--muted)'}"></i> ${f.name}</span><span>${f.size}</span>`;
            if (f.isDir) el.onclick = () => loadFileBrowser((p ? p + '/' : '') + f.name);
            else el.onclick = () => openEditor((p ? p + '/' : '') + f.name);
            list.appendChild(el);
        });
    });
}

function uploadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const fd = new FormData();
        fd.append('file', e.target.files[0]);
        fetch('/api/files/upload', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    Toastify({ text: 'Archivo subido', style: { background: '#10b981' } }).showToast();
                    loadFileBrowser(currentPath);
                }
            });
    };
    input.click();
}

// --- 9. EDITOR ---
const editor = ace.edit("ace-editor");
editor.setTheme("ace/theme/dracula");
editor.setOptions({ fontSize: "14px" });

function openEditor(f) {
    currentFile = f;
    api('files/read', { file: f }).then(d => {
        if (!d.error) {
            document.getElementById('editor-modal').style.display = 'flex';
            editor.setValue(d.content, -1);
            const mode = f.endsWith('.json') ? 'json' : f.endsWith('.properties') ? 'properties' : 'text';
            editor.session.setMode("ace/mode/" + mode);
        }
    });
}

function saveFile() {
    api('files/save', { file: currentFile, content: editor.getValue() }).then(() => {
        document.getElementById('editor-modal').style.display = 'none';
        Toastify({ text: 'Guardado', style: { background: '#10b981' } }).showToast();
    });
}

function closeEditor() {
    document.getElementById('editor-modal').style.display = 'none';
}

// --- 10. BACKUPS & CONFIG ---
function loadBackups() {
    api('backups').then(b => {
        const list = document.getElementById('backup-list');
        list.innerHTML = '';
        b.forEach(k => {
            const el = document.createElement('div');
            el.className = 'file-row';
            el.innerHTML = `<span>${k.name}</span><div><button class="btn btn-sm" onclick="restoreBackup('${k.name}')">Restaurar</button><button class="btn btn-sm stop" onclick="deleteBackup('${k.name}')">X</button></div>`;
            list.appendChild(el);
        });
    });
}

function createBackup() {
    Toastify({ text: 'Creando backup...', style: { background: 'var(--p)' } }).showToast();
    api('backups/create').then(() => setTimeout(loadBackups, 2000));
}

function deleteBackup(n) {
    if (confirm('¿Borrar?')) api('backups/delete', { name: n }).then(loadBackups);
}

function restoreBackup(n) {
    if (confirm('⚠ ESTO SOBRESCRIBIRÁ EL SERVIDOR. ¿Restaurar?')) api('backups/restore', { name: n });
}

function loadCfg() {
    api('config').then(d => {
        const c = document.getElementById('cfg-list');
        c.innerHTML = '';
        for (const [k, v] of Object.entries(d)) {
            c.innerHTML += `<div><label style="font-size:11px;color:var(--p)">${k}</label><input class="cfg-in" data-k="${k}" value="${v}"></div>`;
        }
    });
}

function saveCfg() {
    const d = {};
    document.querySelectorAll('.cfg-in').forEach(i => d[i.dataset.k] = i.value);
    api('config', d).then(() => Toastify({ text: 'Configuración guardada', style: { background: '#10b981' } }).showToast());
}
