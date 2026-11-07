package com.da7e.ai;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int CAMERA_PERMISSION_CODE = 100;
    private PermissionRequest pendingPermissionRequest;

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
            public void onPermissionRequest(final PermissionRequest request) {
                pendingPermissionRequest = request;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
                } else {
                    request.grant(request.getResources());
                }
            }
        });

        // Request camera permission upfront for QR scanning
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
        }

        // Default: loads the Da7e AI local interface or search for laptop
        String url = getIntent().getDataString();
        if (url != null && !url.isEmpty()) {
            webView.loadUrl(url);
        } else {
            // Embedded initial connect screen with live camera QR scanner & auto-port detection
            loadInitialScannerHtml();
        }
    }

    private void loadInitialScannerHtml() {
        String html = "<!DOCTYPE html><html lang='en'><head><meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>" +
                "<style>" +
                "*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;}" +
                "body{background:#0b0f19;color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}" +
                ".logo-box{width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,#0284c7,#6366f1);display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:16px;box-shadow:0 12px 24px rgba(2,132,199,0.35);}" +
                "h2{font-size:22px;font-weight:800;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px;}" +
                "p{color:#94a3b8;font-size:13px;margin-bottom:22px;line-height:1.5;}" +
                ".card{background:rgba(22,30,49,0.9);border:1px solid rgba(56,189,248,0.25);border-radius:24px;padding:24px 20px;width:100%;max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.5);}" +
                ".btn-scan{width:100%;background:linear-gradient(135deg,#0284c7,#6366f1);color:#fff;border:none;padding:15px;border-radius:14px;font-size:15px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;margin-bottom:14px;box-shadow:0 8px 20px rgba(99,102,241,0.35);}" +
                ".btn-scan:active{transform:scale(0.98);}" +
                ".divider{display:flex;align-items:center;margin:16px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;}" +
                ".divider::before,.divider::after{content:'';flex:1;height:1px;background:#334155;margin:0 10px;}" +
                "input{width:100%;padding:14px;border-radius:14px;border:1px solid rgba(56,189,248,0.3);background:#0f172a;color:#fff;font-size:15px;margin-bottom:12px;outline:none;text-align:center;}" +
                "input:focus{border-color:#38bdf8;box-shadow:0 0 10px rgba(56,189,248,0.3);}" +
                ".btn-connect{width:100%;background:#1e293b;color:#38bdf8;border:1px solid #38bdf8;padding:13px;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;}" +
                ".btn-connect:active{background:#0284c7;color:#fff;}" +
                "#recentBox{margin-top:16px;display:none;background:rgba(30,41,59,0.6);border-radius:12px;padding:10px;font-size:12px;color:#94a3b8;cursor:pointer;}" +
                "#scannerModal{display:none;position:fixed;inset:0;background:#000;z-index:999;flex-direction:column;align-items:center;justify-content:center;}" +
                "#scannerVideo{width:100%;height:100%;object-fit:cover;}" +
                ".scanner-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 20px;pointer-events:none;}" +
                ".scan-frame{width:260px;height:260px;border:2px solid #38bdf8;border-radius:24px;box-shadow:0 0 30px rgba(56,189,248,0.5);position:relative;animation:pulse 2s infinite;}" +
                "@keyframes pulse{0%,100%{border-color:#38bdf8;}50%{border-color:#818cf8;}}" +
                ".btn-close{pointer-events:auto;background:rgba(255,255,255,0.2);color:#fff;border:none;padding:12px 28px;border-radius:20px;font-weight:bold;backdrop-filter:blur(10px);}" +
                "</style></head><body>" +
                "<div class='logo-box'>🤖</div>" +
                "<h2>⚡ Da7eBot AI Remote</h2>" +
                "<p>Connect your phone to VS Code on your laptop (Same Wi-Fi network)</p>" +
                "<div class='card'>" +
                "<button class='btn-scan' onclick='startCameraScan()'>📷 Scan Laptop QR Code</button>" +
                "<label style='display:block;cursor:pointer;background:rgba(255,255,255,0.06);padding:10px;border-radius:12px;font-size:13px;color:#94a3b8;margin-bottom:6px;'>" +
                "📸 Take Photo of QR Code" +
                "<input type='file' accept='image/*' capture='environment' style='display:none;' onchange='handleImageFile(this)'>" +
                "</label>" +
                "<div class='divider'>OR ENTER IP</div>" +
                "<input type='text' id='laptopIp' placeholder='e.g. 192.168.1.15' />" +
                "<button class='btn-connect' onclick='connectManual()'>⚡ Connect to Laptop</button>" +
                "<div id='recentBox' onclick='connectRecent()'></div>" +
                "</div>" +
                "<div id='scannerModal'>" +
                "<video id='scannerVideo' autoplay playsinline></video>" +
                "<div class='scanner-overlay'>" +
                "<p style='color:#fff;font-size:16px;background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:20px;'>Point camera at VS Code QR Code</p>" +
                "<div class='scan-frame'></div>" +
                "<button class='btn-close' onclick='stopCameraScan()'>Cancel</button>" +
                "</div>" +
                "</div>" +
                "<canvas id='scanCanvas' style='display:none;'></canvas>" +
                "<script>" +
                "let videoStream = null; let scanInterval = null;" +
                "const lastUrl = localStorage.getItem('da7e_last_url');" +
                "if (lastUrl) {" +
                "  const b = document.getElementById('recentBox');" +
                "  b.style.display = 'block';" +
                "  b.innerHTML = '⚡ Last connected: <b style=\"color:#38bdf8;\">' + lastUrl + '</b> (Tap to connect)';" +
                "}" +
                "function connectRecent() { if (lastUrl) navigateTo(lastUrl); }" +
                "function connectManual() {" +
                "  let raw = document.getElementById('laptopIp').value.trim();" +
                "  if (!raw) { alert('Please enter your laptop IP address shown in VS Code'); return; }" +
                "  raw = raw.replace(/\/+$/, '');" +
                "  if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'http://' + raw;" +
                "  try {" +
                "    let parsed = new URL(raw);" +
                "    if (!parsed.port) {" +
                "      raw = parsed.protocol + '//' + parsed.hostname + ':38888' + parsed.pathname + parsed.search;" +
                "    }" +
                "  } catch(e) {" +
                "    if (!raw.includes(':', 7)) raw = raw + ':38888';" +
                "  }" +
                "  navigateTo(raw);" +
                "}" +
                "function navigateTo(url) {" +
                "  localStorage.setItem('da7e_last_url', url);" +
                "  window.location.href = url;" +
                "}" +
                "async function startCameraScan() {" +
                "  const modal = document.getElementById('scannerModal');" +
                "  const video = document.getElementById('scannerVideo');" +
                "  modal.style.display = 'flex';" +
                "  try {" +
                "    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });" +
                "    video.srcObject = videoStream;" +
                "    await video.play();" +
                "    if ('BarcodeDetector' in window) {" +
                "      const detector = new BarcodeDetector({ formats: ['qr_code'] });" +
                "      scanInterval = setInterval(async () => {" +
                "        try {" +
                "          const barcodes = await detector.detect(video);" +
                "          if (barcodes && barcodes.length > 0) {" +
                "            const raw = barcodes[0].rawValue;" +
                "            stopCameraScan();" +
                "            navigateTo(raw);" +
                "          }" +
                "        } catch(e) {}" +
                "      }, 300);" +
                "    }" +
                "  } catch(err) {" +
                "    alert('Camera access error: ' + err.message);" +
                "    stopCameraScan();" +
                "  }" +
                "}" +
                "function stopCameraScan() {" +
                "  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }" +
                "  if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }" +
                "  document.getElementById('scannerModal').style.display = 'none';" +
                "}" +
                "async function handleImageFile(input) {" +
                "  const file = input.files && input.files[0];" +
                "  if (!file) return;" +
                "  if ('BarcodeDetector' in window) {" +
                "    try {" +
                "      const img = new Image();" +
                "      img.src = URL.createObjectURL(file);" +
                "      await img.decode();" +
                "      const detector = new BarcodeDetector({ formats: ['qr_code'] });" +
                "      const barcodes = await detector.detect(img);" +
                "      if (barcodes && barcodes.length > 0) {" +
                "        navigateTo(barcodes[0].rawValue);" +
                "        return;" +
                "      }" +
                "    } catch(e) {}" +
                "  }" +
                "  alert('Could not detect QR code in photo. Please ensure clear lighting or enter IP manually.');" +
                "}" +
                "</script></body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingPermissionRequest != null) {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                }
            } else {
                Toast.makeText(this, "Camera permission needed for QR code scanner", Toast.LENGTH_SHORT).show();
            }
        }
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
