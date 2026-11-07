// Da7e AI Sidebar View Provider for VS Code
const vscode = require('vscode');

class Da7eSidebarProvider {
  constructor(extensionUri, lanServer, aiService) {
    this._extensionUri = extensionUri;
    this._lanServer = lanServer;
    this._aiService = aiService;
    this._view = null;
    this._chatHistory = []; // Persistent chat history across sidebar closes/reopens

    this._lanServer.onStatusChanged = () => {
      this.updateView();
    };

    this._lanServer.onChatSync = (chatData) => {
      // Save to persistent history
      this._chatHistory.push({
        sender: chatData.sender,
        from: chatData.from || chatData.sender,
        prompt: chatData.prompt,
        reply: chatData.reply
      });

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
          } else {
            const config = vscode.workspace.getConfiguration('da7e');
            await this._lanServer.start(config.get('serverPort'), config.get('securityPin'));
          }
          this.updateView();
          break;

        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'da7e');
          break;

        case 'clearHistory':
          this._chatHistory = [];
          this.updateView();
          break;

        case 'askAi':
          const editor = vscode.window.activeTextEditor;
          const context = {
            activeFileName: editor ? editor.document.fileName : null,
            language: editor ? editor.document.languageId : null,
            selectedCode: editor ? editor.document.getText(editor.selection) : ''
          };

          const reply = await this._lanServer.handleUserMessage(data.prompt, context);

          // Save to persistent history
          this._chatHistory.push({
            sender: 'laptop',
            from: 'laptop',
            prompt: data.prompt,
            reply: reply
          });

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
    const isConnected = this._lanServer.isPhoneConnected();
    const pin = this._lanServer.pin;

    // Build persistent chat history HTML
    const escapeHtml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const formatText = (str) => escapeHtml(str).replace(/\n/g, '<br>');

    const historyHtml = this._chatHistory.map(item => {
      if (item.sender === 'mobile' || item.from === 'phone') {
        return `<div style="margin-top:10px;"><span class="badge-tag badge-phone">📱 From Phone</span> <span style="color:#f8fafc; font-weight:600;">${escapeHtml(item.prompt)}</span></div>` +
               `<div style="margin-top:4px; padding-left:8px; border-left:2px solid #10b981; color:#e2e8f0;"><b>🤖 Da7e AI:</b> ${formatText(item.reply)}</div>`;
      } else {
        return `<div style="margin-top:10px;"><span class="badge-tag badge-laptop">💻 From Laptop</span> <span style="color:#f8fafc; font-weight:600;">${escapeHtml(item.prompt)}</span></div>` +
               `<div style="margin-top:4px; padding-left:8px; border-left:2px solid #38bdf8; color:#e2e8f0;"><b>🤖 Da7e AI:</b> ${formatText(item.reply)}</div>`;
      }
    }).join('');

    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 10px;
      font-size: 12px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .code-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #38bdf8);
      border-radius: 12px;
      padding: 14px;
      text-align: center;
      margin-bottom: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .code-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #38bdf8;
      text-transform: uppercase;
    }
    .code-digits {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 8px;
      color: #38bdf8;
      font-family: monospace;
      padding: 8px 0;
      text-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
    }
    .connected-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 6px 10px;
      margin-bottom: 8px;
      font-weight: 700;
      color: #10b981;
      font-size: 11px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      display: inline-block;
      margin-right: 6px;
    }
    .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 10px;
      overflow: hidden;
      min-height: 0;
    }
    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--vscode-widget-border, #222);
      font-weight: 700;
      color: #38bdf8;
    }
    .chat-box {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      font-size: 11.5px;
      line-height: 1.5;
    }
    .input-bar {
      display: flex;
      gap: 6px;
      padding: 8px;
      background: rgba(0,0,0,0.15);
      border-top: 1px solid var(--vscode-widget-border, #222);
    }
    .input-bar input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #444);
      border-radius: 6px;
      padding: 7px 10px;
      outline: none;
      font-size: 11.5px;
    }
    .input-bar button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      padding: 7px 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .badge-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
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

  ${!isConnected ? `
    <!-- When not connected: Show only the pairing code, no QR code -->
    <div class="code-card">
      <div class="code-title">📱 Connect Phone to Laptop</div>
      <div style="font-size:11px; color:#94a3b8; margin-top:3px;">Enter this code in your phone app:</div>
      <div class="code-digits">${pin}</div>
      <div style="font-size:10px; color:#64748b;">Connects automatically on same Wi-Fi</div>
    </div>
  ` : `
    <!-- When connected: Pairing code is completely removed, leaving ONLY the chat -->
    <div class="connected-bar">
      <div><span class="pulse-dot"></span>📱 Phone Connected (Live Sync)</div>
      <span style="font-size:10px; color:#94a3b8; cursor:pointer;" onclick="vscode.postMessage({ type: 'clearHistory' })">🧹 Clear</span>
    </div>
  `}

  <!-- Chat takes up the entire space -->
  <div class="chat-container">
    <div class="chat-header">
      <span>🤖 Da7e AI Chat</span>
      <span style="font-size:10px; color:#94a3b8; cursor:pointer;" onclick="vscode.postMessage({ type: 'openSettings' })">⚙️ Settings</span>
    </div>

    <div class="chat-box" id="sidebarChatBox">
      ${historyHtml || '<div style="color:#94a3b8; text-align:center; margin-top:40px;">Ready! Type a message or say: "اعمل فايل test.js", "اعمل فولدر src", "نفذ امر dir", "اقفل اللابتوب"...</div>'}
    </div>

    <div class="input-bar">
      <input type="text" id="sidebarPrompt" placeholder="Message Da7e AI, create file, run cmd..." onkeydown="if(event.key==='Enter') sendPrompt()">
      <button onclick="sendPrompt()">Send</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // Scroll chat to bottom immediately on load
    const box = document.getElementById('sidebarChatBox');
    if (box) box.scrollTop = box.scrollHeight;

    function sendPrompt() {
      const input = document.getElementById('sidebarPrompt');
      const val = input.value.trim();
      if (!val) return;

      box.innerHTML += '<div style="margin-top:10px;"><span class="badge-tag badge-laptop">💻 From Laptop</span> <span style="color:#f8fafc; font-weight:600;">' + escapeHtml(val) + '</span></div>';
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
      if (msg.type === 'aiReply') {
        box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #38bdf8; color:#e2e8f0;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
        box.scrollTop = box.scrollHeight;
      } else if (msg.type === 'chatSync') {
        if (msg.sender === 'mobile' || msg.from === 'phone') {
          box.innerHTML += '<div style="margin-top:10px;"><span class="badge-tag badge-phone">📱 From Phone</span> <span style="color:#f8fafc; font-weight:600;">' + escapeHtml(msg.prompt) + '</span></div>';
          box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #10b981; color:#e2e8f0;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
        } else if (msg.sender === 'laptop') {
          box.innerHTML += '<div style="margin-top:10px;"><span class="badge-tag badge-laptop">💻 From Laptop</span> <span style="color:#f8fafc; font-weight:600;">' + escapeHtml(msg.prompt) + '</span></div>';
          box.innerHTML += '<div style="margin-top:4px; padding-left:8px; border-left:2px solid #38bdf8; color:#e2e8f0;"><b>🤖 Da7e AI:</b> ' + formatText(msg.reply) + '</div>';
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
