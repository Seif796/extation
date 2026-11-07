// Da7e AI Local LAN HTTP & SSE Server
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const vscode = require('vscode');
const { getMobileHtml } = require('./mobileHtml');

class LanServer {
  constructor(aiService) {
    this.aiService = aiService;
    this.server = null;
    this.port = 38888;
    this.pin = this.generatePin();
    this.authToken = crypto.randomBytes(16).toString('hex');
    this.localIp = this.getLocalIpAddress();
    this.sseClients = new Set();
    this.connectedPhonesCount = 0;
    this.phoneConnected = false;
    this.onStatusChanged = null;
    this.onChatSync = null;
    this.terminal = null;
    this.isStarting = false;
  }

  getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    let fallbackIp = '127.0.0.1';

    // 1. Try to find Wi-Fi or wireless adapter first
    for (const name in interfaces) {
      const lower = name.toLowerCase();
      if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless') || lower.includes('wlan')) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
    }

    // 2. Try common LAN subnets (192.168.x.x or 10.x.x.x)
    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
            return iface.address;
          }
          fallbackIp = iface.address;
        }
      }
    }

    return fallbackIp;
  }

  generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  isPhoneConnected() {
    return this.phoneConnected || this.sseClients.size > 0 || this.connectedPhonesCount > 0;
  }

  start(customPort, customPin) {
    return new Promise((resolve) => {
      this.port = customPort || this.port || 38888;
      if (customPin) this.pin = customPin;
      this.localIp = this.getLocalIpAddress();
      this.isStarting = true;

      if (this.server) {
        try { this.server.close(); } catch (e) {}
      }

      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      const tryListen = (portToTry) => {
        this.port = portToTry;
        this.server.listen(this.port, '0.0.0.0', () => {
          this.isStarting = false;
          console.log(`[Da7e AI] Server running on http://${this.localIp}:${this.port}`);
          if (this.onStatusChanged) this.onStatusChanged();
          resolve(true);
        });
      };

      this.server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Da7e AI] Port ${this.port} is busy, trying ${this.port + 1}...`);
          tryListen(this.port + 1);
        } else {
          this.isStarting = false;
          console.error('[Da7e AI] Server error:', err);
          resolve(false);
        }
      });

      tryListen(this.port);
    });
  }

  stop() {
    if (this.server) {
      try { this.server.close(); } catch (e) {}
      this.server = null;
      this.isStarting = false;
      this.sseClients.clear();
      this.phoneConnected = false;
      this.connectedPhonesCount = 0;
      if (this.onStatusChanged) this.onStatusChanged();
    }
  }

  isRunning() {
    return (!!this.server && this.server.listening) || this.isStarting;
  }

  getConnectionUrl() {
    return `http://${this.localIp}:${this.port}?pin=${this.pin}`;
  }

  broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch (e) {}
    }
  }

  async parseBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }

  // Ultra-Fast Instant Laptop Controller & Intent Parser (< 0.05 seconds response!)
  async tryHandleLaptopCommand(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;
    const p = prompt.trim().toLowerCase();

    // 1. Lock screen / Lock laptop workstation
    if (/^(اقفل|قفل|قفل\s*شاشة|اقفل\s*شاشة|lock|قفل\s*الكمبيوتر)\s*(اللابتوب|الجهاز|الشاشه|الشاشة|الكمبيوتر|laptop|pc|screen)?$/i.test(p) ||
        p === 'اقفل اللابتوب' || p === 'قفل اللابتوب' || p === 'اقفل الجهاز' || p === 'قفل الجهاز' || p === 'lock' || p === 'lock laptop' || p === 'lock screen') {
      child_process.exec('rundll32.exe user32.dll,LockWorkStation');
      return '🔒 **تم قفل شاشة اللابتوب بنجاح وبسرعة فائقة!**';
    }

    // 2. Volume Up
    if (/^(علي|ارفع|زود|رفع)\s*(الصوت|صوت)?$/i.test(p) || p.includes('علي الصوت') || p.includes('ارفع الصوت') || p === 'volume up' || p === 'vol up' || p === 'louder') {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175); (New-Object -ComObject WScript.Shell).SendKeys([char]175); (New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
      return '🔊 **تم رفع مستوى صوت اللابتوب!**';
    }

    // 3. Volume Down
    if (/^(وطي|خفض|نقص|وطى)\s*(الصوت|صوت)?$/i.test(p) || p.includes('وطي الصوت') || p.includes('خفض الصوت') || p === 'volume down' || p === 'vol down' || p === 'quieter') {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174); (New-Object -ComObject WScript.Shell).SendKeys([char]174); (New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
      return '🔉 **تم خفض مستوى صوت اللابتوب!**';
    }

    // 4. Mute / Unmute
    if (/^(اكتم|كتم|صامت|سكات)\s*(الصوت)?$/i.test(p) || p === 'mute' || p === 'unmute' || p.includes('كتم الصوت')) {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
      return '🔇 **تم تبديل / كتم صوت اللابتوب!**';
    }

    // 5. Media Play / Pause
    if (/^(شغل|وقف|شغل\s*وقف)\s*(الميديا|الفيديو|الموسيقى|الميوزك|فيديو)?$/i.test(p) || p === 'play' || p === 'pause' || p.includes('شغل الفيديو') || p.includes('وقف الفيديو')) {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"');
      return '⏯️ **تم تشغيل / إيقاف الميديا على اللابتوب!**';
    }

    // 6. Save Files
    if (p === 'احفظ' || p === 'احفظ الملف' || p === 'احفظ الملفات' || p === 'احفظ الكود' || p === 'احفظ الكل' || p === 'save' || p === 'save all') {
      await vscode.commands.executeCommand('workbench.action.files.saveAll');
      return '💾 **تم حفظ جميع الملفات في VS Code فوراً!**';
    }

    // 7. Toggle Terminal
    if (p === 'افتح التيرمينال' || p === 'اغلق التيرمينال' || p === 'التيرمينال' || p === 'تيرمينال' || p === 'terminal' || p === 'open terminal') {
      await vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
      return '⚡ **تم فتح / تبديل التيرمينال على اللابتوب!**';
    }

    // 8. Run Active File
    if (p === 'شغل الكود' || p === 'شغل الملف' || p === 'شغل البرنامج' || p === 'run' || p === 'run file' || p === 'run code') {
      await this.runActiveFileInternal();
      return '▶️ **جاري تشغيل الكود في تيرمينال اللابتوب!**';
    }

    // 9. Clear Terminal
    if (p === 'نظف التيرمينال' || p === 'امسح التيرمينال' || p === 'امسح الشاشة' || p === 'clear' || p === 'clear terminal') {
      await vscode.commands.executeCommand('workbench.action.terminal.clear');
      return '🧹 **تم تنظيف نافذة التيرمينال!**';
    }

    // 10. Sleep Laptop
    if (p === 'نوم اللابتوب' || p === 'نوم الجهاز' || p === 'وضع السكون' || p === 'sleep' || p === 'sleep laptop') {
      child_process.exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
      return '💤 **جاري وضع اللابتوب في وضع السكون (Sleep)!**';
    }

    // 11. Shutdown Laptop with 60s timer
    if (p === 'اطفي اللابتوب' || p === 'اطفي الجهاز' || p === 'اغلق اللابتوب' || p === 'shutdown' || p === 'turn off laptop') {
      child_process.exec('shutdown /s /t 60');
      return '⚠️ **جاري إيقاف تشغيل اللابتوب بعد 60 ثانية!**\nإذا أردت إلغاء الإطفاء فوراً، اكتب في الشات: **الغي الاطفاء**';
    }

    // 12. Cancel Shutdown
    if (p === 'الغي الاطفاء' || p === 'الغاء الاطفاء' || p === 'cancel shutdown' || p === 'abort shutdown') {
      child_process.exec('shutdown /a');
      return '✅ **تم إلغاء إيقاف تشغيل اللابتوب بنجاح!**';
    }

    // 13. Copy text to laptop clipboard
    if (p.startsWith('انسخ ') || p.startsWith('copy ')) {
      const textToCopy = prompt.replace(/^(انسخ|copy)\s+/i, '').trim();
      if (textToCopy) {
        await vscode.env.clipboard.writeText(textToCopy);
        return `📋 **تم نسخ النص إلى حافظة لابتوبك فوراً:** "${textToCopy}"`;
      }
    }

    // 14. Run command in terminal (e.g. "نفذ أمر dir", "cmd: git status")
    if (p.startsWith('نفذ امر ') || p.startsWith('نفذ أمر ') || p.startsWith('شغل امر ') || p.startsWith('cmd: ') || p.startsWith('run: ')) {
      const cmd = prompt.replace(/^(نفذ امر |نفذ أمر |شغل امر |cmd:\s*|run:\s*)/i, '').trim();
      if (cmd) {
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
          this.terminal = vscode.window.createTerminal('Da7e AI Terminal');
        }
        this.terminal.show();
        this.terminal.sendText(cmd);
        this.broadcastSSE({ type: 'terminal', line: `$ ${cmd}` });
        return `💻 **تم تشغيل الأمر في تيرمينال اللابتوب فوراً:** \`${cmd}\``;
      }
    }

    // 15. Fast Chit-Chat & Greetings (10ms instant response)
    if (/^(سلام|سلام عليكم|السلام عليكم|مرحبا|أهلا|اهلا|ازيك|عامل ايه|صباح الخير|مساء الخير|hi|hello|hey)$/i.test(p)) {
      return '👋 **أهلاً بك! أنا Da7e AI، متحكم ومساعد لابتوبك السريع.**\n' +
             'أنا تحت أمرك وأستجيب في لحظات! جرب أن تكتب لي:\n' +
             '• **اقفل اللابتوب** (لقفل الشاشة فوراً)\n' +
             '• **علي الصوت** أو **وطي الصوت** أو **اكتم الصوت**\n' +
             '• **احفظ الملفات** أو **افتح التيرمينال** أو **شغل الكود**\n' +
             '• أو اسألني أي سؤال برمجي وسأجيبك بذكاء!';
    }

    if (/^(مين انت|من انت|who are you|انت مين)$/i.test(p)) {
      return '🤖 **أنا Da7e AI:** مساعدك البرمجي الذكي وجهاز التحكم الكامل في اللابتوب عن بُعد من الهاتف، أستطيع كتابة الأكواد والتحكم في الصوت والشاشة والنظام فوراً!';
    }

    if (/^(شكرا|تسلم|الف شكر|thank you|thanks)$/i.test(p)) {
      return '❤️ **العفو يا بطل! أنا دائماً في خدمتك وتحت أمرك.**';
    }

    if (/^(تمام|اوكي|ماشي|ok|okay|done)$/i.test(p)) {
      return '⚡ **عظيم! جاهز لأي أمر قادم.**';
    }

    return null;
  }

  async runActiveFileInternal() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.fileName;
      const ext = path.extname(filePath).toLowerCase();
      let runCmd = '';
      if (ext === '.js') runCmd = `node "${filePath}"`;
      else if (ext === '.py') runCmd = `python "${filePath}"`;
      else if (ext === '.ts') runCmd = `npx ts-node "${filePath}"`;
      else if (ext === '.sh') runCmd = `bash "${filePath}"`;
      else runCmd = `"${filePath}"`;

      if (!this.terminal || this.terminal.exitStatus !== undefined) {
        this.terminal = vscode.window.createTerminal('Da7e AI Terminal');
      }
      this.terminal.show();
      this.terminal.sendText(runCmd);
      this.broadcastSSE({ type: 'terminal', line: `$ ${runCmd}` });
    }
  }

  async handleUserMessage(prompt, context) {
    // 1. Instant local command execution (< 0.05s)
    const instantReply = await this.tryHandleLaptopCommand(prompt);
    if (instantReply) {
      return instantReply;
    }

    // 2. Intelligent AI response (Gemini 3.5 Flash Lite)
    return await this.aiService.ask(prompt, context);
  }

  async handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());

    // 1. Mobile Web UI & Assets
    if (!pathname.startsWith('/api/')) {
      if (pathname === '/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const manifestPath = path.join(__dirname, 'manifest.json');
        return res.end(fs.readFileSync(manifestPath, 'utf8'));
      }

      if (pathname === '/icon.png' || pathname === '/app_icon.png') {
        const iconPath = path.join(__dirname, 'media', 'icon.png');
        if (fs.existsSync(iconPath)) {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          return res.end(fs.readFileSync(iconPath));
        }
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(getMobileHtml(this.localIp, this.port, this.pin));
    }

    // 2. Authentication with PIN & Instant Secure Connection
    if (pathname === '/api/auth' && req.method === 'POST') {
      const body = await this.parseBody(req);
      if (body.pin && body.pin.toString() === this.pin.toString()) {
        const clientIp = (req.socket.remoteAddress || 'Mobile Phone').replace('::ffff:', '');
        
        this.connectedPhonesCount++;
        this.phoneConnected = true;
        vscode.window.showInformationMessage(`🎉 Da7e AI: Phone [${clientIp}] connected! Live Chat & Remote Control active.`);
        
        if (this.onStatusChanged) this.onStatusChanged();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, token: this.authToken }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Invalid PIN. Check your laptop screen.' }));
      }
    }

    // 3. SSE Stream
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('\n');
      this.sseClients.add(res);
      this.phoneConnected = true;
      if (this.onStatusChanged) this.onStatusChanged();

      req.on('close', () => {
        this.sseClients.delete(res);
        if (this.sseClients.size === 0) {
          this.phoneConnected = false;
        }
        if (this.onStatusChanged) this.onStatusChanged();
      });
      return;
    }

    // Auth verification
    const authHeader = req.headers['authorization'];
    const body = (req.method === 'POST') ? await this.parseBody(req) : {};
    const token = (authHeader ? authHeader.replace('Bearer ', '') : '') || queryParams.token || body.token;

    if (token !== this.authToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized. PIN required.' }));
    }

    // 4. Editor State
    if (pathname === '/api/state' && req.method === 'GET') {
      const editor = vscode.window.activeTextEditor;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const data = {
        fileName: editor ? path.basename(editor.document.fileName) : null,
        filePath: editor ? editor.document.fileName : null,
        language: editor ? editor.document.languageId : null,
        selectedCode: editor ? editor.document.getText(editor.selection) : '',
        totalLines: editor ? editor.document.lineCount : 0,
        workspaceName: workspaceFolder ? workspaceFolder.name : null
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    }

    // 5. Insert Code into VS Code
    if (pathname === '/api/editor/insert' && req.method === 'POST') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'No active editor found in VS Code' }));
      }

      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, body.code || '');
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 6. Replace Selection
    if (pathname === '/api/editor/replace' && req.method === 'POST') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'No active editor found in VS Code' }));
      }

      await editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, body.code || '');
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 7. Actions (save, undo, redo, format)
    if (pathname === '/api/editor/action' && req.method === 'POST') {
      const action = body.action;
      if (action === 'save') await vscode.commands.executeCommand('workbench.action.files.save');
      if (action === 'undo') await vscode.commands.executeCommand('undo');
      if (action === 'redo') await vscode.commands.executeCommand('redo');
      if (action === 'format') await vscode.commands.executeCommand('editor.action.formatDocument');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 8. Files
    if (pathname === '/api/files' && req.method === 'GET') {
      const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 50);
      const files = uris.map(u => vscode.workspace.asRelativePath(u));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ files }));
    }

    // 9. Open File
    if (pathname === '/api/editor/open' && req.method === 'POST') {
      const relativePath = body.file;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder && relativePath) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 10. Run Terminal Command
    if (pathname === '/api/terminal/run' && req.method === 'POST') {
      const cmd = body.command;
      if (!this.terminal || this.terminal.exitStatus !== undefined) {
        this.terminal = vscode.window.createTerminal('Da7e AI Terminal');
      }
      this.terminal.show();
      this.terminal.sendText(cmd);
      this.broadcastSSE({ type: 'terminal', line: `$ ${cmd}` });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 11. Run Active File
    if (pathname === '/api/terminal/run-file' && req.method === 'POST') {
      await this.runActiveFileInternal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 12. Remote Laptop System Control
    if (pathname === '/api/system/control' && req.method === 'POST') {
      const action = body.action;
      try {
        if (action === 'volume-up') {
          child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175); (New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
        } else if (action === 'volume-down') {
          child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174); (New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
        } else if (action === 'volume-mute') {
          child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
        } else if (action === 'media-play-pause') {
          child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"');
        } else if (action === 'lock-screen') {
          child_process.exec('rundll32.exe user32.dll,LockWorkStation');
        } else if (action === 'toggle-terminal') {
          vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
        } else if (action === 'save-all') {
          vscode.commands.executeCommand('workbench.action.files.saveAll');
        } else if (action === 'reload-window') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        } else if (action === 'close-editor') {
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } else if (action === 'clipboard-copy') {
          if (body.text) await vscode.env.clipboard.writeText(body.text);
        } else if (action === 'laptop-notify') {
          if (body.message) vscode.window.showInformationMessage(`📱 Phone says: ${body.message}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 13. System Stats (Laptop status for mobile dashboard)
    if (pathname === '/api/system/stats' && req.method === 'GET') {
      const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
      const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
      const uptimeHours = (os.uptime() / 3600).toFixed(1);
      const data = {
        platform: os.platform(),
        hostname: os.hostname(),
        memoryUsed: totalMemMb - freeMemMb,
        memoryTotal: totalMemMb,
        uptime: `${uptimeHours} hrs`,
        cpus: os.cpus().length
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    }

    // 14. AI Ask & Dual Sync (< 0.05s for commands, ~1.5s for deep questions)
    if (pathname === '/api/ai/ask' && req.method === 'POST') {
      const editor = vscode.window.activeTextEditor;
      const context = {
        activeFileName: editor ? path.basename(editor.document.fileName) : null,
        language: editor ? editor.document.languageId : null,
        selectedCode: editor ? editor.document.getText(editor.selection) : '',
        codeSnippet: editor ? editor.document.getText() : ''
      };

      const reply = await this.handleUserMessage(body.prompt || '', context);
      
      // Real-time synchronization to Laptop & Mobile (tagged from phone)
      this.broadcastSSE({
        type: 'chatSync',
        sender: 'mobile',
        from: 'phone',
        prompt: body.prompt,
        reply
      });
      if (this.onChatSync) {
        this.onChatSync({ sender: 'mobile', from: 'phone', prompt: body.prompt, reply });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ reply }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}

module.exports = LanServer;
