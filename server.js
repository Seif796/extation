// Da7e AI Local LAN HTTP & SSE Server
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
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

    // 1. Mobile Web UI & Assets (Serve for any non-API path so IP is never "Not Found")
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

      // Default: Always serve mobile.html for any frontend path
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(getMobileHtml(this.localIp, this.port, this.pin));
    }

    // 2. Authentication with PIN & Instant Secure Connection
    if (pathname === '/api/auth' && req.method === 'POST') {
      const body = await this.parseBody(req);
      if (body.pin && body.pin.toString() === this.pin.toString()) {
        const clientIp = (req.socket.remoteAddress || 'Mobile Phone').replace('::ffff:', '');
        
        this.connectedPhonesCount++;
        vscode.window.showInformationMessage(`🎉 Da7e AI: Phone [${clientIp}] connected! Dual-screen AI chat & remote control active.`);
        
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
      req.on('close', () => this.sseClients.delete(res));
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 12. AI Ask
    if (pathname === '/api/ai/ask' && req.method === 'POST') {
      const editor = vscode.window.activeTextEditor;
      const context = {
        activeFileName: editor ? path.basename(editor.document.fileName) : null,
        language: editor ? editor.document.languageId : null,
        selectedCode: editor ? editor.document.getText(editor.selection) : '',
        codeSnippet: editor ? editor.document.getText() : ''
      };

      const reply = await this.aiService.ask(body.prompt || '', context);
      
      // Real-time synchronization to Laptop & Mobile
      this.broadcastSSE({
        type: 'chatSync',
        sender: 'mobile',
        prompt: body.prompt,
        reply
      });
      if (this.onChatSync) {
        this.onChatSync({ sender: 'mobile', prompt: body.prompt, reply });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ reply }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}

module.exports = LanServer;
