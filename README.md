# 🚀 Da7eBot AI - Code Assistant & Mobile Remote Controller

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com)
[![Platform](https://img.shields.io/badge/platform-VS%20Code-007ACC.svg)](https://code.visualstudio.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Da7eBot AI** is an advanced AI coding assistant and mobile remote controller for Visual Studio Code. It allows you to control your editor, run terminal commands, and collaborate with AI directly from your smartphone (**iPhone or Android**) over your local Wi-Fi network (LAN).

---

## 🌟 Key Features

### 1. 🤖 Da7e AI Coding Assistant
- **Real-Time Code Intelligence:** Ask Da7e AI to explain code, fix bugs, optimize algorithms, or write new features.
- **One-Tap Laptop Injection (`⚡ Send to Laptop`):** Insert AI-generated code directly into your active VS Code editor with a single tap from your phone.
- **Detailed Step-by-Step Explanations:** Every code response includes an in-depth breakdown explaining the logic, performance impact, and architectural improvements.
- **Voice Dictation (🎙️):** Dictate instructions and code snippets in natural language directly from your smartphone microphone.

### 2. 📱 Remote Phone Control (iPhone & Android)
- **Live Active Editor View:** View current file names, cursor line numbers, and selections live on your mobile device.
- **Remote Editing & Code Injection:** Write code on your phone and insert or replace selections in VS Code on your laptop.
- **Quick Editor Actions:** Save files (`Ctrl+S`), format documents, undo, and redo with dedicated touch controls.
- **Terminal Control:** Execute commands, run current active files (Python, Node.js, TypeScript), and stream terminal logs live to your phone.
- **Workspace File Explorer:** Browse project files and open any file in VS Code from your mobile device.

### 3. 🔐 Laptop Approval Security System
- **Authorized Access Only:** When a mobile device attempts to connect (via QR code or PIN), an interactive approval dialog pops up in VS Code on your laptop:
  > *"📱 Da7e AI: Phone Connection Request from [192.168.x.x]! Allow this device to control VS Code? [Accept] [Reject]"*
- Remote control is granted **only after you explicitly accept on your laptop**.
- **Scan Anytime:** Use the integrated camera scanner on your phone to scan the QR code at any time without repetitive manual pairing.
- **Persistent Sessions:** Once approved, your trusted device reconnects automatically without re-prompting.

---

## ⚡ Quick Start Guide

### Step 1: Install & Activate
1. Install **Da7eBot AI** from the Visual Studio Code Marketplace.
2. The **Da7e AI** icon will appear on your Activity Bar (left sidebar).
3. The server starts automatically and displays your local IP, port, and security PIN.

### Step 2: Connect from Your Phone
1. Ensure your smartphone and laptop are connected to the **same local Wi-Fi network**.
2. Scan the **QR Code** displayed in the VS Code sidebar or bottom status bar.
   - *Alternatively, tap the `📷 Scan Laptop QR Code` button in the mobile app at any time.*
3. Click **"Accept"** on the prompt in VS Code on your laptop to authorize the session.
4. Enjoy seamless, wireless coding control from your smartphone!

---

## ⚙️ Configuration & AI Providers

Open VS Code Settings (`Ctrl + ,`) and search for `da7e`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `da7e.aiProvider` | `gemini` | AI Provider: `gemini`, `groq`, `openai`, `ollama`, or `free-offline` |
| `da7e.apiKey` | `(default key)` | Your API Key for Google Gemini, Groq, or OpenAI |
| `da7e.aiModel` | `gemini-1.5-flash` | Model identifier (e.g. `gemini-1.5-flash`, `llama-3.3-70b-versatile`) |
| `da7e.serverPort` | `38888` | Local HTTP/SSE port for the mobile controller server |
| `da7e.securityPin` | `""` | Custom security PIN (leave blank for auto-generated 4-digit PIN) |

---

## 📲 Installing as a Native Mobile App (PWA & APK)

- **Instant Mobile App (iOS & Android):** When you open the controller on Safari (iOS) or Chrome (Android), tap **"Install App"** or select **"Add to Home Screen"**. It installs as a native, full-screen mobile app with the official Da7e icon.
- **Android APK:** You can also download the pre-compiled Android APK directly from our GitHub Releases repository.

---

## 📄 License

This extension is open-sourced under the [MIT License](LICENSE.txt).
