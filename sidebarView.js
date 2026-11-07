// Da7e AI Sidebar View Provider for VS Code
const vscode = require('vscode');
const { generateSvgQRCode } = require('./qrCode');

class Da7eSidebarProvider {
  constructor(extensionUri, lanServer, aiService) {
    this._extensionUri = extensionUri;
    this._lanServer = lanServer;
    this._aiService = aiService;
    this._view = null;

    this._lanServer.onStatusChanged = () => {
      this.updateView();
    };

    this._lanServer.onChatSync = (chatData) => {
      if (this._view) {
        this._view.webview.postMessage({
          type: 'chatSync',
          sender: chatData.sender,
          from: chatData.from || chatData.sender,
          prompt: chatData.prompt,
          reply: chatData.reply
        });
      }
    };
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    if (!this._lanServer.isRunning()) {
      const config = vscode.workspace.getConfiguration('da7e');
      this._lanServer.start(config.get('serverPort'), config.get('securityPin')).then(() => {
        this.updateView();
      });
    }

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'toggleServer':
          if (this._lanServer.isRunning()) {
            this._lanServer.stop();
            vscode.window.showInformationMessage('Da7e AI: LAN Server stopped.');
          } else {
            const config = vscode.workspace.getConfiguration('da7e');
            await this._lanServer.start(config.get('serverPort'), config.get('securityPin'));
            vscode.window.showInformationMessage(`Da7e AI: Running at ${this._lanServer.getConnectionUrl()}`);
          }
          this.updateView();
          break;

        case 'copyUrl':
          await vscode.env.clipboard.writeText(this._lanServer.getConnectionUrl());
          vscode.window.showInformationMessage('✅ Copied mobile link to clipboard!');
          break;

        case 'openInBrowser':
          vscode.env.openExternal(vscode.Uri.parse(this._lanServer.getConnectionUrl()));
          break;

        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'da7e');
          break;

        case 'askAi':
          const editor = vscode.window.activeTextEditor;
          const context = {
            activeFileName: editor ? editor.document.fileName : null,
            language: editor ? editor.document.languageId : null,
            selectedCode: editor ? editor.document.getText(editor.selection) : ''
          };
          const reply = await this._aiService.ask(data.prompt, context);
          this._view.webview.postMessage({ type: 'aiReply', reply, prompt: data.prompt });
          // Synchronize to mobile phone via SSE
          this._lanServer.broadcastSSE({
            type: 'chatSync',
            sender: 'laptop',
            from: 'laptop',
            prompt: data.prompt,
            reply
          });
          break;
      }
    });

    this.updateView();
  }

  updateView() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview();
    }
  }

  _getHtmlForWebview() {
    const isRunning = this._lanServer.isRunning();
    const isConnected = this._lanServer.isPhoneConnected();
    const url = this._lanServer.getConnectionUrl();
    const pin = this._lanServer.pin;
    const ip = this._lanServer.localIp;
    const port = this._lanServer.port;
    const qrSvg = generateSvgQRCode(url, 6, 2);

    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px;
      font-size: 12px;
      margin: 0;
      box-sizing: border-box;
      line-height: 1.5;
    }
    .badge-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #38bdf8);
      border-radius: 14px;
      padding: 14px;
      text-align: center;
      margin-bottom: 14px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .status-pill.online {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border: 1px solid #10b981;
    }
    .status-pill.offline {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border: 1px solid #ef4444;
    }
    .status-pill.connected {
      background: rgba(16, 185, 129, 0.25);
      color: #10b981;
      border: 1px solid #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .connected-banner {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 12px;
      padding: 12px;
      margin: 10px 0;
      text-align: center;
    }
    .qr-container {
      margin: 10px auto;
      max-width: 190px;
      padding: 10px;
      background: #ffffff;
      border-radius: 14px;
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .qr-container svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .info-box {
      background: rgba(0,0,0,0.25);
      border-radius: 8px;
      padding: 8px 12px;
      margin: 10px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 11px;
    }
    .pin-display {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 4px;
      color: #38bdf8;
      font-family: monospace;
    }
    .btn {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      padding: 9px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn.secondary {
      background: var(--vscode-button-secondaryBackground, #2d3748);
      color: var(--vscode-button-secondaryForeground, #fff);
    }
    .btn.primary-action {
      background: linear-gradient(135deg, #0284c7, #6366f1);
      color: white;
    }
    .chat-section {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 12px;
      padding: 12px;
    }
    .chat-box {
      height: 180px;
      overflow-y: auto;
      border: 1px solid var(--vscode-widget-border, #222);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      font-size: 11px;
    }
    .input-row {
      display: flex;
      gap: 6px;
    }
    .input-row input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #444);
      border-radius: 4px;
      padding: 6px 8px;
      outline: none;
      font-size: 11px;
    }
    .badge-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      margin-right: 4px;
    }
    .badge-phone {
      background: rgba(16, 185, 129, 0.25);
      color: #10b981;
      border: 1px solid #10b981;
    }
    .badge-laptop {
      background: rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      border: 1px solid #38bdf8;
    }
  </style>
</head>
<body>
  <div class="badge-card">
    ${isConnected ? `
      <!-- Phone Connected State: QR is Hidden Automatically -->
      <div class="status-pill connected">
        <span>●</span>
        <span>📱 Mobile Connected (Live)</span>
      </div>
      <div class="connected-banner">
        <div style="font-size: 13px; font-weight: 800; color: #10b981;">🎉 Device Connected & Linked!</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Dual-screen AI chat & remote control active.</div>
        <button class="btn secondary" style="margin-top: 8px; font-size: 10px; padding: 5px;" onclick="toggleQr()">
          👁️ Toggle QR Code View
        </button>
      </div>
      <div id="qrWrapper" style="display: none;">
        <div class="qr-container">
          ${qrSvg}
        </div>
      </div>
    ` : `
      <!-- Phone Not Connected: Show QR Code to Scan -->
      <div class="status-pill online">
        <span>●</span>
        <span>${isRunning ? 'Online - Scan with Phone' : 'Starting Server...'}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">
        📱 Scan with Mobile Camera to Connect:
      </div>
      <div class="qr-container" id="qrContainer">
        ${qrSvg}
      </div>
    `}

    <div class="info-box">
      <div class="info-row">
        <span>Security PIN:</span>
        <span class="pin-display">${pin}</span>
      </div>
      <div class="info-row">
        <span>Local IP:</span>
        <span style="font-family:monospace; color:#10b981;">${ip}:${port}</span>
      </div>
    </div>

    <button class="btn primary-action" onclick="vscode.postMessage({ type: 'openInBrowser' })">
      🌐 Open Mobile UI in Browser
    </button>
    <button class="btn secondary" onclick="vscode.postMessage({ type: 'copyUrl' })">
      📋 Copy Direct Link
    </button>
    <button class="btn secondary" onclick="vscode.postMessage({ type: 'openSettings' })">
      ⚙️ AI Settings
    </button>
  </div>

  <div class="chat-section">
    <div style="font-weight:700; margin-bottom:6px; color:#38bdf8; display:flex; justify-content:space-between; align-items:center;">
      <span>🤖 Da7e AI Live Chat:</span>
      <span style="font-size:10px; color:#94a3b8;">${isConnected ? '🟢 Phone Synced' : '⚪ Waiting Phone'}</span>
    </div>
    <div class="chat-box" id="sidebarChatBox">
      <div style="color:#94a3b8;">Ask Da7e AI anything. Type here or from your phone...</div>
    </div>
    <div class="input-row">
      <input type="text" id="sidebarPrompt" placeholder="Ask Da7e AI..." onkeydown="if(event.key==='Enter') sendPrompt()">
      <button class="btn" style="width:auto; margin-top:0;" onclick="sendPrompt()">Send</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function toggleQr() {
      const q = document.getElementById('qrWrapper');
      if (q) {
        q.style.display = (q.style.display === 'none' ? 'block' : 'none');
      }
    }

    function sendPrompt() {
      const input = document.getElementById('sidebarPrompt');
      const val = input.value.trim();
      if (!val) return;
      const box = document.getElementById('sidebarChatBox');
      box.innerHTML += '<div style="margin-top:6px;"><span class="badge-tag badge-laptop">💻 From Laptop</span> <b>You:</b> ' + escapeHtml(val) + '</div>';
      input.value = '';
      box.scrollTop = box.scrollHeight;

      vscode.postMessage({ type: 'askAi', prompt: val });
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatText(str) {
      return escapeHtml(str).replace(/\\n/g, '<br>');
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      const box = document.getElementById('sidebarChatBox');

      if (msg.type === 'aiReply') {
        box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #38bdf8;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
        box.scrollTop = box.scrollHeight;
      } else if (msg.type === 'chatSync') {
        if (msg.sender === 'mobile' || msg.from === 'phone') {
          box.innerHTML += '<div style="margin-top:6px;"><span class="badge-tag badge-phone">📱 From Phone</span> <b>Mobile User:</b> ' + escapeHtml(msg.prompt) + '</div>';
          box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #10b981;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
        } else if (msg.sender === 'laptop') {
          box.innerHTML += '<div style="margin-top:6px;"><span class="badge-tag badge-laptop">💻 From Laptop</span> <b>Laptop:</b> ' + escapeHtml(msg.prompt) + '</div>';
          box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #38bdf8;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
        }
        box.scrollTop = box.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
  }
}

module.exports = Da7eSidebarProvider;
