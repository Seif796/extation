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

  getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    return process.cwd();
  }

  resolveSafePath(relPath) {
    if (!relPath || typeof relPath !== 'string') {
      throw new Error('Invalid path provided');
    }
    const cleanRel = relPath.trim().replace(/^[\/\\]+/, '');
    const root = this.getWorkspaceRoot();
    const fullPath = path.resolve(root, cleanRel);
    const normalizedRoot = path.normalize(root).toLowerCase();
    const normalizedPath = path.normalize(fullPath).toLowerCase();
    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new Error('Access outside workspace root is not allowed');
    }
    return fullPath;
  }

  getWorkspaceTree(dirPath = this.getWorkspaceRoot(), relativePath = '', depth = 0) {
    if (depth > 5) return [];
    const ignored = new Set([
      'node_modules', '.git', '.gradle', 'build', '.vscode', 'dist', 'bin', 'obj', '.gemini', '.idea', '.system_generated'
    ]);
    try {
      if (!fs.existsSync(dirPath)) return [];
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = [];
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
        return a.isDirectory() ? -1 : 1;
      });

      for (const entry of sorted) {
        if (ignored.has(entry.name)) continue;
        const entryRelPath = relativePath ? path.join(relativePath, entry.name).replace(/\\/g, '/') : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            type: 'folder',
            path: entryRelPath,
            children: this.getWorkspaceTree(fullPath, entryRelPath, depth + 1)
          });
        } else {
          let size = 0;
          try { size = fs.statSync(fullPath).size; } catch (e) {}
          items.push({
            name: entry.name,
            type: 'file',
            path: entryRelPath,
            size
          });
        }
      }
      return items;
    } catch (err) {
      return [];
    }
  }

  async createWorkspaceFile(relPath, content = '') {
    const fullPath = this.resolveSafePath(relPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content || '', 'utf8');
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc);
    const relative = path.relative(this.getWorkspaceRoot(), fullPath).replace(/\\/g, '/');
    this.broadcastSSE({ type: 'fileCreated', path: relative });
    return relative;
  }

  createWorkspaceFolder(relPath) {
    const fullPath = this.resolveSafePath(relPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    const relative = path.relative(this.getWorkspaceRoot(), fullPath).replace(/\\/g, '/');
    this.broadcastSSE({ type: 'folderCreated', path: relative });
    return relative;
  }

  deleteWorkspacePath(relPath) {
    const fullPath = this.resolveSafePath(relPath);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      const relative = path.relative(this.getWorkspaceRoot(), fullPath).replace(/\\/g, '/');
      this.broadcastSSE({ type: 'pathDeleted', path: relative });
      return relative;
    }
    throw new Error('File or folder not found: ' + relPath);
  }

  readWorkspaceFile(relPath) {
    const fullPath = this.resolveSafePath(relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found: ' + relPath);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  executeTerminalCommand(cmd) {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal('Da7e AI Terminal');
    }
    this.terminal.show(true);
    this.terminal.sendText(cmd);
    this.broadcastSSE({ type: 'terminal', line: `$ ${cmd}` });

    return new Promise((resolve) => {
      child_process.exec(cmd, { cwd: this.getWorkspaceRoot(), timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        let output = (stdout || '') + (stderr || '');
        if (err && !output) output = err.message;
        if (!output.trim()) output = 'Command executed successfully (no terminal output).';
        
        const lines = output.split(/\r?\n/);
        for (const l of lines) {
          if (l.trim()) {
            this.broadcastSSE({ type: 'terminal', line: l });
          }
        }
        resolve(output.trim());
      });
    });
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

    // 1. Create File in Project (e.g. "اعمل فايل test.js", "create file src/index.js")
    const createFileMatch = prompt.match(/^(?:اعمل|انشئ|انشىء|كريت|سوي|اصنع|create|make|new)\s+(?:فايل|ملف|file)\s+([^\s:]+)(?:[:\s]+(?:واكتب\s+فيه|واكتب\s+كود|with\s+content|content:)?\s*([\s\S]*))?$/i) ||
                            prompt.match(/^touch\s+([^\s:]+)(?:[:\s]+([\s\S]*))?$/i);
    if (createFileMatch) {
      const filePath = createFileMatch[1].trim();
      const content = (createFileMatch[2] || '').trim();
      try {
        const created = await this.createWorkspaceFile(filePath, content);
        return `📄 **تم إنشاء وفتح الملف بنجاح في VS Code!**\n` +
               `📁 **المسار:** \`${created}\`\n` +
               (content ? `📝 **تمت كتابة المحتوى المطلوب داخل الملف.**` : `💡 الملف مفتوح وجاهز للتعديل الآن!`);
      } catch (err) {
        return `⚠️ **فشل إنشاء الملف:** ${err.message}`;
      }
    }

    // 2. Create Folder in Project (e.g. "اعمل فولدر src", "create folder components")
    const createFolderMatch = prompt.match(/^(?:اعمل|انشئ|انشىء|كريت|سوي|اصنع|create|make|new)\s+(?:فولدر|مجلد|دليل|folder|dir)\s+(.+)$/i) ||
                              prompt.match(/^mkdir\s+(.+)$/i);
    if (createFolderMatch) {
      const folderPath = createFolderMatch[1].trim();
      try {
        const created = this.createWorkspaceFolder(folderPath);
        return `📁 **تم إنشاء المجلد بنجاح في مشروعك!**\n` +
               `📍 **المسار:** \`${created}\``;
      } catch (err) {
        return `⚠️ **فشل إنشاء المجلد:** ${err.message}`;
      }
    }

    // 3. Delete File/Folder in Project (e.g. "احذف ملف test.js", "delete file old.txt")
    const deleteMatch = prompt.match(/^(?:احذف|حذف|امسح|remove|delete)\s+(?:فايل|ملف|فولدر|مجلد|file|folder)\s+(.+)$/i) ||
                        prompt.match(/^rm\s+(.+)$/i);
    if (deleteMatch) {
      const targetPath = deleteMatch[1].trim();
      try {
        const deleted = this.deleteWorkspacePath(targetPath);
        return `🗑️ **تم حذف العنصر بنجاح من المشروع:** \`${deleted}\``;
      } catch (err) {
        return `⚠️ **فشل حذف العنصر:** ${err.message}`;
      }
    }

    // 4. Read / View File in Project (e.g. "اقرا ملف package.json", "cat server.js")
    const readFileMatch = prompt.match(/^(?:اقرا|إقرا|عرض|افتح|وريني|read|cat|view|open)\s+(?:فايل|ملف|file)\s+(.+)$/i) ||
                          prompt.match(/^cat\s+(.+)$/i);
    if (readFileMatch) {
      const filePath = readFileMatch[1].trim();
      try {
        const content = this.readWorkspaceFile(filePath);
        const ext = path.extname(filePath).replace('.', '') || 'text';
        const preview = content.length > 2500 ? content.slice(0, 2500) + '\n\n... [Content truncated for chat preview]' : content;
        return `📄 **محتوى الملف:** \`${filePath}\`\n\n\`\`\`${ext}\n${preview}\n\`\`\``;
      } catch (err) {
        return `⚠️ **فشل قراءة الملف:** ${err.message}`;
      }
    }

    // 5. List Files / Project Tree (e.g. "وريني الملفات", "عرض الملفات", "ls", "dir")
    if (/^(وريني\s*الملفات|عرض\s*الملفات|قائمة\s*الملفات|ملفات\s*المشروع|شجرة\s*الملفات|list\s*files|show\s*files|ls|dir)$/i.test(p)) {
      try {
        const tree = this.getWorkspaceTree();
        const formatTree = (items, indent = '') => {
          let res = '';
          for (const it of items) {
            if (it.type === 'folder') {
              res += `${indent}📁 **${it.name}/**\n`;
              if (it.children && it.children.length > 0) {
                res += formatTree(it.children, indent + '   ');
              }
            } else {
              res += `${indent}📄 \`${it.name}\`\n`;
            }
          }
          return res;
        };
        const treeStr = formatTree(tree);
        return `📂 **ملفات وفولدرات المشروع الحالي:**\n\n${treeStr || 'المشروع فارغ أو لا يحتوي على ملفات.'}\n\n💡 يمكنك قول: **اعمل فايل [الاسم]** أو **اعمل فولدر [الاسم]** لإنشاء عناصر جديدة!`;
      } catch (err) {
        return `⚠️ **حدث خطأ أثناء قراءة الملفات:** ${err.message}`;
      }
    }

    // 6. Run Terminal Command (e.g. "نفذ امر dir", "cmd: git status", "امر npm test")
    const termMatch = prompt.match(/^(?:نفذ\s*امر|نفذ\s*أمر|شغل\s*امر|شغل\s*أمر|امر|أمر|تيرمينال|تيرمنال|cmd:|run:|terminal:|\$)\s+(.+)$/i);
    if (termMatch) {
      const cmd = termMatch[1].trim();
      if (cmd) {
        const output = await this.executeTerminalCommand(cmd);
        return `💻 **تم تنفيذ الأمر في تيرمينال اللابتوب:** \`$ ${cmd}\`\n\n\`\`\`bash\n${output}\n\`\`\``;
      }
    }

    // 7. Lock screen / Lock laptop workstation
    if (/^(اقفل|قفل|قفل\s*شاشة|اقفل\s*شاشة|lock|قفل\s*الكمبيوتر)\s*(اللابتوب|الجهاز|الشاشه|الشاشة|الكمبيوتر|laptop|pc|screen)?$/i.test(p) ||
        p === 'اقفل اللابتوب' || p === 'قفل اللابتوب' || p === 'اقفل الجهاز' || p === 'قفل الجهاز' || p === 'lock' || p === 'lock laptop' || p === 'lock screen') {
      child_process.exec('rundll32.exe user32.dll,LockWorkStation');
      return '🔒 **تم قفل شاشة اللابتوب بنجاح وبسرعة فائقة!**';
    }

    // 8. Volume Up
    if (/^(علي|ارفع|زود|رفع)\s*(الصوت|صوت)?$/i.test(p) || p.includes('علي الصوت') || p.includes('ارفع الصوت') || p === 'volume up' || p === 'vol up' || p === 'louder') {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175); (New-Object -ComObject WScript.Shell).SendKeys([char]175); (New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
      return '🔊 **تم رفع مستوى صوت اللابتوب!**';
    }

    // 9. Volume Down
    if (/^(وطي|خفض|نقص|وطى)\s*(الصوت|صوت)?$/i.test(p) || p.includes('وطي الصوت') || p.includes('خفض الصوت') || p === 'volume down' || p === 'vol down' || p === 'quieter') {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174); (New-Object -ComObject WScript.Shell).SendKeys([char]174); (New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
      return '🔉 **تم خفض مستوى صوت اللابتوب!**';
    }

    // 10. Mute / Unmute
    if (/^(اكتم|كتم|صامت|سكات)\s*(الصوت)?$/i.test(p) || p === 'mute' || p === 'unmute' || p.includes('كتم الصوت')) {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
      return '🔇 **تم تبديل / كتم صوت اللابتوب!**';
    }

    // 11. Media Play / Pause
    if (/^(شغل|وقف|شغل\s*وقف)\s*(الميديا|الفيديو|الموسيقى|الميوزك|فيديو)?$/i.test(p) || p === 'play' || p === 'pause' || p.includes('شغل الفيديو') || p.includes('وقف الفيديو')) {
      child_process.exec('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"');
      return '⏯️ **تم تشغيل / إيقاف الميديا على اللابتوب!**';
    }

    // 12. Save Files
    if (p === 'احفظ' || p === 'احفظ الملف' || p === 'احفظ الملفات' || p === 'احفظ الكود' || p === 'احفظ الكل' || p === 'save' || p === 'save all') {
      await vscode.commands.executeCommand('workbench.action.files.saveAll');
      return '💾 **تم حفظ جميع الملفات في VS Code فوراً!**';
    }

    // 13. Toggle Terminal
    if (p === 'افتح التيرمينال' || p === 'اغلق التيرمينال' || p === 'التيرمينال' || p === 'تيرمينال' || p === 'terminal' || p === 'open terminal') {
      await vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
      return '⚡ **تم فتح / تبديل التيرمينال على اللابتوب!**';
    }

    // 14. Run Active File
    if (p === 'شغل الكود' || p === 'شغل الملف' || p === 'شغل البرنامج' || p === 'run' || p === 'run file' || p === 'run code') {
      await this.runActiveFileInternal();
      return '▶️ **جاري تشغيل الكود في تيرمينال اللابتوب!**';
    }

    // 15. Clear Terminal
    if (p === 'نظف التيرمينال' || p === 'امسح التيرمينال' || p === 'امسح الشاشة' || p === 'clear' || p === 'clear terminal') {
      await vscode.commands.executeCommand('workbench.action.terminal.clear');
      return '🧹 **تم تنظيف نافذة التيرمينال!**';
    }

    // 16. Sleep Laptop
    if (p === 'نوم اللابتوب' || p === 'نوم الجهاز' || p === 'وضع السكون' || p === 'sleep' || p === 'sleep laptop') {
      child_process.exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
      return '💤 **جاري وضع اللابتوب في وضع السكون (Sleep)!**';
    }

    // 17. Shutdown Laptop with 60s timer
    if (p === 'اطفي اللابتوب' || p === 'اطفي الجهاز' || p === 'اغلق اللابتوب' || p === 'shutdown' || p === 'turn off laptop') {
      child_process.exec('shutdown /s /t 60');
      return '⚠️ **جاري إيقاف تشغيل اللابتوب بعد 60 ثانية!**\nإذا أردت إلغاء الإطفاء فوراً، اكتب في الشات: **الغي الاطفاء**';
    }

    // 18. Cancel Shutdown
    if (p === 'الغي الاطفاء' || p === 'الغاء الاطفاء' || p === 'cancel shutdown' || p === 'abort shutdown') {
      child_process.exec('shutdown /a');
      return '✅ **تم إلغاء إيقاف تشغيل اللابتوب بنجاح!**';
    }

    // 19. Copy text to laptop clipboard
    if (p.startsWith('انسخ ') || p.startsWith('copy ')) {
      const textToCopy = prompt.replace(/^(انسخ|copy)\s+/i, '').trim();
      if (textToCopy) {
        await vscode.env.clipboard.writeText(textToCopy);
        return `📋 **تم نسخ النص إلى حافظة لابتوبك فوراً:** "${textToCopy}"`;
      }
    }

    // 20. Fast Chit-Chat & Greetings (10ms instant response)
    if (/^(سلام|سلام عليكم|السلام عليكم|مرحبا|أهلا|اهلا|ازيك|عامل ايه|صباح الخير|مساء الخير|hi|hello|hey)$/i.test(p)) {
      return '👋 **أهلاً بك! أنا Da7e AI، متحكم ومساعد لابتوبك السريع.**\n' +
             'أنا تحت أمرك وأستجيب في لحظات! جرب أن تكتب لي:\n' +
             '• **اعمل فايل test.js** (لإنشاء ملف جديد فوراً في المشروع)\n' +
             '• **اعمل فولدر src/api** (لإنشاء مجلد جديد)\n' +
             '• **نفذ امر dir** أو **نفذ امر git status** (لتشغيل الأوامر في التيرمينال)\n' +
             '• **وريني الملفات** (لعرض شجرة ملفات المشروع)\n' +
             '• **اقفل اللابتوب** أو **علي الصوت** أو **احفظ الملفات**\n' +
             '• أو اسألني أي سؤال برمجي وسأجيبك بأذكى الحلول!';
    }

    if (/^(مين انت|من انت|who are you|انت مين)$/i.test(p)) {
      return '🤖 **أنا Da7e AI:** مساعدك البرمجي الذكي وجهاز التحكم الكامل في اللابتوب والمشاريع والتيرمينال عن بُعد، أستطيع إنشاء الملفات، تشغيل الأوامر، والتحكم في النظام فوراً!';
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
      this.terminal.show(true);
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

    // 2. Authentication with PIN & Permission Request on Laptop
    if (pathname === '/api/auth' && req.method === 'POST') {
      const body = await this.parseBody(req);
      if (body.pin && body.pin.toString() === this.pin.toString()) {
        const clientIp = (req.socket.remoteAddress || 'Mobile Phone').replace('::ffff:', '');
        
        // Show permission request dialog on laptop with Accept/Reject
        const choice = await vscode.window.showInformationMessage(
          `📱 Da7e AI: Phone [${clientIp}] is requesting connection. Allow?`,
          { modal: true },
          'Accept (موافق)',
          'Reject (رفض)'
        );

        if (choice === 'Accept (موافق)') {
          this.connectedPhonesCount++;
          this.phoneConnected = true;
          vscode.window.showInformationMessage(`🎉 Da7e AI: Phone [${clientIp}] connected! Full Control Enabled.`);
          if (this.onStatusChanged) this.onStatusChanged();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, token: this.authToken }));
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Connection rejected on laptop screen.' }));
        }
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

    // 8. Files Flat List (Backwards Compatibility)
    if (pathname === '/api/files' && req.method === 'GET') {
      const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 200);
      const files = uris.map(u => vscode.workspace.asRelativePath(u));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ files }));
    }

    // 9. Full Recursive Project Files & Folders Tree
    if (pathname === '/api/tree' && req.method === 'GET') {
      const rootFolder = vscode.workspace.workspaceFolders?.[0];
      const rootName = rootFolder ? rootFolder.name : path.basename(this.getWorkspaceRoot());
      const tree = this.getWorkspaceTree();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ root: rootName, tree }));
    }

    // 10. Create New File in Project
    if (pathname === '/api/files/create' && req.method === 'POST') {
      const targetPath = body.path;
      const content = body.content || '';
      if (!targetPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'File path is required' }));
      }
      try {
        const created = await this.createWorkspaceFile(targetPath, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, path: created }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 11. Create New Folder in Project
    if (pathname === '/api/folders/create' && req.method === 'POST') {
      const targetPath = body.path;
      if (!targetPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Folder path is required' }));
      }
      try {
        const created = this.createWorkspaceFolder(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, path: created }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 12. Read File Content
    if (pathname === '/api/files/read' && req.method === 'POST') {
      const targetFile = body.file || body.path;
      if (!targetFile) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'File path is required' }));
      }
      try {
        const content = this.readWorkspaceFile(targetFile);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, content, path: targetFile }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 13. Delete File or Folder
    if (pathname === '/api/files/delete' && req.method === 'POST') {
      const targetPath = body.path;
      if (!targetPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Path is required' }));
      }
      try {
        const deleted = this.deleteWorkspacePath(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, path: deleted }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 14. Open File in VS Code
    if (pathname === '/api/editor/open' && req.method === 'POST') {
      const relativePath = body.file || body.path;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder && relativePath) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 15. Run Terminal Command (Interactive with output capture)
    if (pathname === '/api/terminal/run' && req.method === 'POST') {
      const cmd = body.command;
      if (!cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Command is required' }));
      }
      try {
        const output = await this.executeTerminalCommand(cmd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, output }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }

    // 16. Run Active File in Terminal
    if (pathname === '/api/terminal/run-file' && req.method === 'POST') {
      await this.runActiveFileInternal();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 17. Remote Laptop System Control
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

    // 18. System Stats (Laptop status for mobile dashboard)
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

    // 19. AI Ask & Dual Sync (< 0.05s for commands, ~1.5s for deep questions)
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
