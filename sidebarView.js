// Da7e AI Sidebar View Provider for VS Code (English UI)
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
          this._view.webview.postMessage({ type: 'aiReply', reply });
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
      height: 130px;
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
  </style>
</head>
<body>
  <div class="badge-card">
    <div class="status-pill online">
      <span>●</span>
      <span>${isRunning ? 'Online - Scan with Phone' : 'Starting Server...'}</span>
    </div>

    <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">
      📱 Scan with iPhone or Android Camera:
    </div>

    <div class="qr-container">
      ${qrSvg}
    </div>

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
    <div style="font-weight:700; margin-bottom:6px; color:#38bdf8;">🤖 Da7e AI Desktop Chat:</div>
    <div class="chat-box" id="sidebarChatBox">
      <div>Ask Da7e AI anything about your code...</div>
    </div>
    <div class="input-row">
      <input type="text" id="sidebarPrompt" placeholder="Ask Da7e AI..." onkeydown="if(event.key==='Enter') sendPrompt()">
      <button class="btn" style="width:auto; margin-top:0;" onclick="sendPrompt()">Send</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function sendPrompt() {
      const input = document.getElementById('sidebarPrompt');
      const val = input.value.trim();
      if (!val) return;
      const box = document.getElementById('sidebarChatBox');
      box.innerHTML += '<div style="color:#38bdf8; margin-top:4px;"><b>You:</b> ' + val + '</div>';
      input.value = '';
      box.scrollTop = box.scrollHeight;

      vscode.postMessage({ type: 'askAi', prompt: val });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'aiReply') {
        const box = document.getElementById('sidebarChatBox');
        box.innerHTML += '<div style="margin-top:4px;"><b>🤖 Da7e AI:</b> ' + msg.reply.replace(/\\n/g, '<br>') + '</div>';
        box.scrollTop = box.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
  }
}

module.exports = Da7eSidebarProvider;
