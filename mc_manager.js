const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class MCManager {
    constructor(io) {
        this.io = io;
        this.process = null;
        this.serverPath = path.join(__dirname, 'servers', 'default');
        if (!fs.existsSync(this.serverPath)) fs.mkdirSync(this.serverPath, { recursive: true });
        this.status = 'OFFLINE';
        this.logs = [];
        this.ram = '4G';
        
        // Variables de actualización
        this.updatePending = false;
        this.updateCallback = null;
    }
    
    setUpdatePending(val, cb) {
        this.updatePending = val;
        this.updateCallback = cb;
        this.io.emit('toast', {type:'info', msg:'Actualización en cola. Se ejecutará al detener el servidor.'});
    }

    log(msg) { this.logs.push(msg); if(this.logs.length>2000)this.logs.shift(); this.io.emit('console_data', msg); }
    getStatus() { return { status: this.status, ram: this.ram }; }
    getRecentLogs() { return this.logs.join(''); }
    
    async start() {
        if (this.status !== 'OFFLINE') return;
        if (this.updatePending) {
            this.io.emit('toast', {type:'warning', msg:'Actualizando antes de iniciar...'});
            if(this.updateCallback) this.updateCallback();
            return; 
        }
        
        const eula = path.join(this.serverPath, 'eula.txt');
        if(!fs.existsSync(eula) || !fs.readFileSync(eula, 'utf8').includes('true')) fs.writeFileSync(eula, 'eula=true');
        
        let jar = fs.readdirSync(this.serverPath).find(f => f.endsWith('.jar') && !f.includes('installer'));
        if (!jar) jar = fs.readdirSync(this.serverPath).find(f => f.includes('forge') && f.endsWith('.jar'));
        if (!jar) { this.io.emit('toast', { type: 'error', msg: 'No JAR found' }); return; }

        this.status = 'STARTING';
        this.io.emit('status_change', this.status);
        this.log('\r\n>>> NEBULA: Iniciando...\r\n');
        
        this.process = spawn('java', ['-Xmx'+this.ram, '-Xms'+this.ram, '-jar', jar, 'nogui'], { cwd: this.serverPath });
        this.process.stdout.on('data', d => { const s=d.toString(); this.log(s); if(s.includes('Done')||s.includes('For help')) { this.status='ONLINE'; this.io.emit('status_change', this.status); }});
        this.process.stderr.on('data', d => this.log(d.toString()));
        this.process.on('close', () => { 
            this.status='OFFLINE'; 
            this.process=null; 
            this.io.emit('status_change', this.status); 
            this.log('\r\nDetenido.\r\n');
            
            // TRIGGER UPDATE ON STOP
            if(this.updatePending && this.updateCallback) {
                this.io.emit('console_data', '\r\n>>> EJECUTANDO ACTUALIZACIÓN PROGRAMADA...\r\n');
                this.updateCallback();
            }
        });
    }
    async stop() { if(this.process && this.status==='ONLINE') { this.status='STOPPING'; this.io.emit('status_change',this.status); this.process.stdin.write('stop\n'); return new Promise(r=>{let c=0;const i=setInterval(()=>{c++;if(this.status==='OFFLINE'||c>20){clearInterval(i);r()}},500)}); }}
    async restart() { await this.stop(); setTimeout(()=>this.start(), 3000); }
    async kill() { if(this.process) { this.process.kill('SIGKILL'); this.status='OFFLINE'; this.io.emit('status_change','OFFLINE'); }}
    sendCommand(c) { if(this.process) this.process.stdin.write(c+'\n'); }
    async installJar(url, filename) {
        this.io.emit('toast', {type:'info', msg:'Descargando...'});
        fs.readdirSync(this.serverPath).forEach(f => { if(f.endsWith('.jar')) fs.unlinkSync(path.join(this.serverPath, f)); });
        const w = fs.createWriteStream(path.join(this.serverPath, filename));
        try { const r = await axios({url, method:'GET', responseType:'stream'}); r.data.pipe(w); return new Promise((res, rej) => { w.on('finish', ()=>{this.io.emit('toast',{type:'success',msg:'Instalado'});res();}); w.on('error', rej); }); } catch(e) { throw e; }
    }
    readProperties() { try{return fs.readFileSync(path.join(this.serverPath,'server.properties'),'utf8').split('\n').reduce((a,l)=>{const[k,v]=l.split('=');if(k&&!l.startsWith('#'))a[k.trim()]=v?v.trim():'';return a;},{});}catch{return{};} }
    writeProperties(p) { fs.writeFileSync(path.join(this.serverPath,'server.properties'), '#Gen by Nebula\n'+Object.entries(p).map(([k,v])=>`${k}=${v}`).join('\n')); }
}
module.exports = MCManager;
