// Da7e AI VS Code Extension Entry Point (English)
const vscode = require('vscode');
const LanServer = require('./server');
const Da7eAiService = require('./aiService');
const Da7eSidebarProvider = require('./sidebarView');
const { generateSvgQRCode } = require('./qrCode');

let lanServer = null;
let aiService = null;
let statusBarItem = null;

async function activate(context) {
  console.log('[Da7e AI] Extension is activating...');

  // 1. Initialize AI Service
  const config = vscode.workspace.getConfiguration('da7e');
  aiService = new Da7eAiService({
    aiProvider: config.get('aiProvider') || 'gemini',
    apiKey: config.get('apiKey') || '',
    aiModel: config.get('aiModel') || 'gemini-3.5-flash-lite',
    ollamaUrl: config.get('ollamaUrl')
  });

  // Listen for configuration updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('da7e')) {
        const cfg = vscode.workspace.getConfiguration('da7e');
        aiService.updateConfig({
          aiProvider: cfg.get('aiProvider') || 'gemini',
          apiKey: cfg.get('apiKey') || '',
          aiModel: cfg.get('aiModel') || 'gemini-3.5-flash-lite',
          ollamaUrl: cfg.get('ollamaUrl')
        });
      }
    })
  );

  // 2. Initialize Server
  lanServer = new LanServer(aiService);

  // 3. Register Sidebar Provider
  const sidebarProvider = new Da7eSidebarProvider(context.extensionUri, lanServer, aiService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('da7e.sidebarView', sidebarProvider)
  );

  // 4. Create Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'da7e.showQrCode';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  // 5. Update UI on server events
  lanServer.onStatusChanged = () => {
    updateStatusBar();
    sidebarProvider.updateView();
  };

  // 6. Broadcast editor events to connected phones via SSE
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && lanServer.isRunning()) {
        lanServer.broadcastSSE({
          type: 'fileChanged',
          fileName: require('path').basename(editor.document.fileName),
          filePath: editor.document.fileName,
          language: editor.document.languageId,
          workspaceName: vscode.workspace.workspaceFolders?.[0]?.name,
          selectedCode: editor.document.getText(editor.selection)
        });
      }
    })
  );

  // 7. Auto-start Server immediately
  const serverPort = config.get('serverPort') || 38888;
  const securityPin = config.get('securityPin') || '';
  await lanServer.start(serverPort, securityPin);
  updateStatusBar();

  // 8. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('da7e.startServer', async () => {
      const cfg = vscode.workspace.getConfiguration('da7e');
      await lanServer.start(cfg.get('serverPort'), cfg.get('securityPin'));
      vscode.commands.executeCommand('da7e.showQrCode');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('da7e.stopServer', () => {
      lanServer.stop();
      vscode.window.showInformationMessage('Da7e AI: LAN Server stopped.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('da7e.openInBrowser', () => {
      const url = lanServer.getConnectionUrl();
      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // Command to show QR Code panel
  context.subscriptions.push(
    vscode.commands.registerCommand('da7e.showQrCode', async () => {
      if (!lanServer.isRunning()) {
        const cfg = vscode.workspace.getConfiguration('da7e');
        await lanServer.start(cfg.get('serverPort'), cfg.get('securityPin'));
      }

      const panel = vscode.window.createWebviewPanel(
        'da7eQrPanel',
        'Da7e AI - Mobile Connection QR Code',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      const url = lanServer.getConnectionUrl();
      const qrSvg = generateSvgQRCode(url, 8, 2);

      panel.webview.html = `<!DOCTYPE html>
      <html lang="en" dir="ltr">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: system-ui, sans-serif;
            background: #0b0f19;
            color: #f8fafc;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 90vh;
            text-align: center;
            padding: 20px;
          }
          .card {
            background: #1e293b;
            border: 2px solid #38bdf8;
            border-radius: 24px;
            padding: 30px;
            max-width: 440px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
          }
          h2 { margin-bottom: 8px; color: #38bdf8; }
          p { color: #94a3b8; font-size: 14px; margin-bottom: 16px; }
          .qr-box {
            background: white;
            padding: 16px;
            border-radius: 16px;
            margin: 16px 0;
            display: inline-block;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          }
          .pin-badge {
            background: linear-gradient(135deg, #0284c7, #6366f1);
            color: #fff;
            padding: 6px 18px;
            border-radius: 20px;
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 5px;
            display: inline-block;
            margin-top: 8px;
          }
          .url-box {
            background: #030712;
            padding: 10px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 13px;
            margin-top: 14px;
            color: #10b981;
            word-break: break-all;
          }
          .btn-open {
            background: #38bdf8;
            color: #000;
            font-weight: 700;
            padding: 10px 18px;
            border-radius: 10px;
            border: none;
            margin-top: 16px;
            cursor: pointer;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📱 Da7e AI Mobile Remote</h2>
          <p>Ensure phone & laptop are on the <b>same Wi-Fi network</b>, then scan with camera:</p>
          <div class="qr-box">${qrSvg}</div>
          <div>Security PIN:</div>
          <div class="pin-badge">${lanServer.pin}</div>
          <div class="url-box">${url}</div>
          <button class="btn-open" onclick="window.open('${url}', '_blank')">🌐 Open Mobile Controller in Browser</button>
        </div>
      </body>
      </html>`;
    })
  );

  // Command to ask AI from editor
  context.subscriptions.push(
    vscode.commands.registerCommand('da7e.askAi', async () => {
      const editor = vscode.window.activeTextEditor;
      const selected = editor ? editor.document.getText(editor.selection) : '';
      const prompt = await vscode.window.showInputBox({
        prompt: 'Ask Da7e AI about code or request a new feature:',
        placeHolder: 'e.g. How do I optimize this function or add error handling?'
      });

      if (!prompt) return;

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Da7e AI is analyzing...',
        cancellable: false
      }, async () => {
        const reply = await aiService.ask(prompt, {
          activeFileName: editor ? editor.document.fileName : null,
          language: editor ? editor.document.languageId : null,
          selectedCode: selected
        });

        const doc = await vscode.workspace.openTextDocument({
          content: `# Da7e AI Response:\n\n${reply}`,
          language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      });
    })
  );

  console.log('[Da7e AI] Activated successfully in English!');
}

function updateStatusBar() {
  if (!statusBarItem) return;
  if (lanServer && lanServer.isRunning()) {
    statusBarItem.text = `$(device-mobile) Da7e AI: ${lanServer.localIp}:${lanServer.port} [PIN: ${lanServer.pin}]`;
    statusBarItem.tooltip = `Da7e AI is running! Click to show QR Code`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(stop) Da7e AI: Stopped`;
    statusBarItem.show();
  }
}

function deactivate() {
  if (lanServer) {
    lanServer.stop();
  }
}

module.exports = {
  activate,
  deactivate
};
