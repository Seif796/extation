package com.da7e.ai;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int REQUEST_FILE_CHOOSER = 102;
    private ValueCallback<Uri[]> uploadMessage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, REQUEST_FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        String url = getIntent().getDataString();
        if (url != null && !url.isEmpty()) {
            webView.loadUrl(url);
        } else {
            loadConnectByCodeHtml();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE_CHOOSER) {
            if (uploadMessage == null) return;
            uploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            uploadMessage = null;
        }
    }

    private void loadConnectByCodeHtml() {
        String html = "<!DOCTYPE html><html lang='en'><head><meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>" +
                "<style>" +
                "*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;}" +
                "body{background:#0b0f19;color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}" +
                ".logo-box{width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,#0284c7,#6366f1);display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:16px;box-shadow:0 12px 24px rgba(2,132,199,0.35);}" +
                "h2{font-size:24px;font-weight:800;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px;}" +
                "p{color:#94a3b8;font-size:13.5px;margin-bottom:24px;line-height:1.5;}" +
                ".card{background:rgba(22,30,49,0.92);border:1px solid rgba(56,189,248,0.3);border-radius:24px;padding:28px 22px;width:100%;max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.5);}" +
                ".pin-label{font-size:12px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}" +
                "input{width:100%;padding:16px;border-radius:16px;border:2px solid rgba(56,189,248,0.4);background:#070d19;color:#38bdf8;font-size:32px;letter-spacing:10px;font-weight:900;margin-bottom:18px;outline:none;text-align:center;font-family:monospace;}" +
                "input:focus{border-color:#38bdf8;box-shadow:0 0 16px rgba(56,189,248,0.4);}" +
                ".btn-connect{width:100%;background:linear-gradient(135deg,#0284c7,#6366f1);color:#fff;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(2,132,199,0.35);}" +
                ".btn-connect:active{transform:scale(0.98);}" +
                "#statusMsg{margin-top:14px;font-size:13px;color:#94a3b8;min-height:20px;}" +
                "</style></head><body>" +
                "<div class='logo-box'>🤖</div>" +
                "<h2>Da7eBot AI Remote</h2>" +
                "<p>Enter the 4-digit code shown on your laptop screen:</p>" +
                "<div class='card'>" +
                "<div class='pin-label'>Enter Pairing Code (الكود):</div>" +
                "<input type='password' id='pairingCode' placeholder='••••' maxlength='6' inputmode='numeric' autofocus />" +
                "<button class='btn-connect' id='connBtn' onclick='connectWithCode()'>⚡ Connect to Laptop</button>" +
                "<div id='statusMsg'></div>" +
                "</div>" +
                "<script>" +
                "const lastUrl = localStorage.getItem('da7e_last_url');" +
                "const lastIp = localStorage.getItem('da7e_last_ip') || '192.168.100.43';" +
                "const lastPin = localStorage.getItem('da7e_last_pin') || '';" +
                "" +
                "// Auto-reconnect if already connected before" +
                "if (lastUrl) {" +
                "  document.getElementById('statusMsg').innerText = '⏳ Connecting automatically to laptop...';" +
                "  fetch(lastUrl + '/api/state', { method: 'GET', signal: AbortSignal.timeout(2000) })" +
                "    .then(r => { if (r.ok) { window.location.href = lastUrl; } else { promptCode(); } })" +
                "    .catch(() => { promptCode(); });" +
                "} else {" +
                "  promptCode();" +
                "}" +
                "" +
                "function promptCode() {" +
                "  if (lastPin) document.getElementById('pairingCode').value = lastPin;" +
                "  document.getElementById('statusMsg').innerText = '';" +
                "}" +
                "" +
                "async function connectWithCode() {" +
                "  const pin = document.getElementById('pairingCode').value.trim();" +
                "  if (!pin) { alert('Please enter the 4-digit code shown on your laptop screen'); return; }" +
                "  const status = document.getElementById('statusMsg');" +
                "  const btn = document.getElementById('connBtn');" +
                "  btn.disabled = true;" +
                "  status.innerText = '🔍 Connecting to laptop on local Wi-Fi...';" +
                "  " +
                "  // Try saved IP first (or default Wi-Fi IP 192.168.100.43)" +
                "  const candidates = [lastIp, '192.168.100.43', '192.168.1.100', '192.168.1.5', '192.168.0.100'];" +
                "  let connectedUrl = null;" +
                "  " +
                "  for (const ip of candidates) {" +
                "    try {" +
                "      const testUrl = 'http://' + ip + ':38888';" +
                "      const res = await fetch(testUrl + '/api/auth', {" +
                "        method: 'POST'," +
                "        headers: { 'Content-Type': 'application/json' }," +
                "        body: JSON.stringify({ pin })," +
                "        signal: AbortSignal.timeout(1500)" +
                "      });" +
                "      const data = await res.json();" +
                "      if (data.success) {" +
                "        localStorage.setItem('da7e_last_ip', ip);" +
                "        localStorage.setItem('da7e_last_pin', pin);" +
                "        localStorage.setItem('da7e_last_url', testUrl + '?pin=' + pin);" +
                "        connectedUrl = testUrl + '?pin=' + pin;" +
                "        break;" +
                "      }" +
                "    } catch(e) {}" +
                "  }" +
                "  " +
                "  if (connectedUrl) {" +
                "    status.innerText = '🎉 Connected! Opening remote chat...';" +
                "    window.location.href = connectedUrl;" +
                "  } else {" +
                "    status.innerText = '❌ Incorrect code or laptop not found on same Wi-Fi. Check laptop screen.';" +
                "    btn.disabled = false;" +
                "  }" +
                "}" +
                "</script></body></html>";
        webView.loadDataWithBaseURL("http://localhost", html, "text/html", "UTF-8", null);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
