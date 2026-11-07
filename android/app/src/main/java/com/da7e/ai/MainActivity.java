package com.da7e.ai;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int CAMERA_PERMISSION_CODE = 100;
    private static final int REQUEST_IMAGE_CAPTURE = 101;
    private static final int REQUEST_FILE_CHOOSER = 102;
    private PermissionRequest pendingPermissionRequest;
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

        webView.addJavascriptInterface(new WebAppInterface(), "AndroidApp");

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

        // Request camera permission upfront for QR scanning
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
        }

        String url = getIntent().getDataString();
        if (url != null && !url.isEmpty()) {
            webView.loadUrl(url);
        } else {
            loadInitialScannerHtml();
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void openCameraScanner() {
            runOnUiThread(() -> {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_CODE);
                } else {
                    launchCamera();
                }
            });
        }
    }

    private void launchCamera() {
        Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        try {
            startActivityForResult(takePictureIntent, REQUEST_IMAGE_CAPTURE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No camera app found on this device", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_IMAGE_CAPTURE && resultCode == RESULT_OK) {
            if (data != null && data.getExtras() != null) {
                Bitmap bitmap = (Bitmap) data.getExtras().get("data");
                if (bitmap != null) {
                    decodeQrCode(bitmap);
                }
            }
        } else if (requestCode == REQUEST_FILE_CHOOSER) {
            if (uploadMessage == null) return;
            uploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            uploadMessage = null;
        }
    }

    private void decodeQrCode(Bitmap bitmap) {
        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int[] intArray = new int[width * height];
            bitmap.getPixels(intArray, 0, width, 0, 0, width, height);

            RGBLuminanceSource source = new RGBLuminanceSource(width, height, intArray);
            BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));
            Result result = new MultiFormatReader().decode(binaryBitmap);

            String qrUrl = result.getText();
            if (qrUrl != null && !qrUrl.isEmpty()) {
                Toast.makeText(this, "✅ QR Code Scanned! Connecting to laptop...", Toast.LENGTH_SHORT).show();
                webView.loadUrl(qrUrl);
                return;
            }
        } catch (Exception e) {
            // Decoding failed
        }
        Toast.makeText(this, "Could not detect QR code in photo. Please point clearly at laptop screen.", Toast.LENGTH_LONG).show();
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
                ".btn-scan{width:100%;background:linear-gradient(135deg,#0284c7,#6366f1);color:#fff;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;margin-bottom:14px;box-shadow:0 8px 20px rgba(99,102,241,0.35);}" +
                ".btn-scan:active{transform:scale(0.98);}" +
                ".divider{display:flex;align-items:center;margin:16px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;}" +
                ".divider::before,.divider::after{content:'';flex:1;height:1px;background:#334155;margin:0 10px;}" +
                "input{width:100%;padding:14px;border-radius:14px;border:1px solid rgba(56,189,248,0.3);background:#0f172a;color:#fff;font-size:15px;margin-bottom:12px;outline:none;text-align:center;}" +
                "input:focus{border-color:#38bdf8;box-shadow:0 0 10px rgba(56,189,248,0.3);}" +
                ".btn-connect{width:100%;background:#1e293b;color:#38bdf8;border:1px solid #38bdf8;padding:14px;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;}" +
                ".btn-connect:active{background:#0284c7;color:#fff;}" +
                "#recentBox{margin-top:16px;display:none;background:rgba(30,41,59,0.6);border-radius:12px;padding:10px;font-size:12px;color:#94a3b8;cursor:pointer;}" +
                "</style></head><body>" +
                "<div class='logo-box'>🤖</div>" +
                "<h2>⚡ Da7eBot AI Remote</h2>" +
                "<p>Connect your phone to VS Code on your laptop (Same Wi-Fi)</p>" +
                "<div class='card'>" +
                "<button class='btn-scan' onclick='scanLaptopQr()'>📷 Scan Laptop QR Code</button>" +
                "<div class='divider'>OR ENTER IP</div>" +
                "<input type='text' id='laptopIp' placeholder='e.g. 192.168.100.43' />" +
                "<button class='btn-connect' onclick='connectManual()'>⚡ Connect to Laptop</button>" +
                "<div id='recentBox' onclick='connectRecent()'></div>" +
                "</div>" +
                "<script>" +
                "const lastUrl = localStorage.getItem('da7e_last_url');" +
                "if (lastUrl) {" +
                "  const b = document.getElementById('recentBox');" +
                "  b.style.display = 'block';" +
                "  b.innerHTML = '⚡ Last connected: <b style=\"color:#38bdf8;\">' + lastUrl + '</b> (Tap to reconnect)';" +
                "}" +
                "function scanLaptopQr() {" +
                "  if (window.AndroidApp && window.AndroidApp.openCameraScanner) {" +
                "    window.AndroidApp.openCameraScanner();" +
                "  } else {" +
                "    alert('Opening camera scanner...');" +
                "  }" +
                "}" +
                "function connectRecent() { if (lastUrl) navigateTo(lastUrl); }" +
                "function connectManual() {" +
                "  let raw = document.getElementById('laptopIp').value.trim();" +
                "  if (!raw) { alert('Please enter your laptop IP address shown in VS Code'); return; }" +
                "  while (raw.endsWith('/')) { raw = raw.slice(0, -1); }" +
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
                "</script></body></html>";
        webView.loadDataWithBaseURL("http://localhost", html, "text/html", "UTF-8", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingPermissionRequest != null) {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                }
                launchCamera();
            } else {
                Toast.makeText(this, "Camera permission needed to scan laptop QR code", Toast.LENGTH_SHORT).show();
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
