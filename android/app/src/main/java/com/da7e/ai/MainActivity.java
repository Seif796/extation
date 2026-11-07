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
        // User can scan laptop QR code to connect directly
        String url = getIntent().getDataString();
        if (url != null && !url.isEmpty()) {
            webView.loadUrl(url);
        } else {
            // Embedded initial connect screen
            loadInitialScannerHtml();
        }
    }

    private void loadInitialScannerHtml() {
        String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
                "<style>body{background:#0b0f19;color:#f8fafc;font-family:sans-serif;text-align:center;padding:30px;}" +
                "h2{color:#38bdf8;}input{width:90%;padding:14px;border-radius:12px;border:1px solid #38bdf8;background:#1e293b;color:#fff;font-size:16px;margin:12px 0;}" +
                "button{background:linear-gradient(135deg,#0284c7,#6366f1);color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;font-weight:bold;width:90%;margin-top:10px;}" +
                "</style></head><body>" +
                "<h2>⚡ Da7e AI Mobile Remote</h2>" +
                "<p>Enter Laptop IP & Port shown in VS Code (or scan QR):</p>" +
                "<input type='text' id='laptopUrl' placeholder='http://192.168.1.xxx:38888' />" +
                "<button onclick='connect()'>Connect to Laptop</button>" +
                "<script>" +
                "function connect(){" +
                "  let u = document.getElementById('laptopUrl').value.trim();" +
                "  if(!u.startsWith('http')) u = 'http://' + u;" +
                "  window.location.href = u;" +
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
