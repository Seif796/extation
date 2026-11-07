package com.da7e.ai;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SharedPreferences prefs;
    private static final String DEFAULT_IP = "192.168.100.43";
    private static final int PORT = 38888;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        prefs = getSharedPreferences("da7e_prefs", MODE_PRIVATE);
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
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    loadErrorScreen(getCurrentIp());
                }
            }
        });

        loadLaptop();
    }

    private String getCurrentIp() {
        return prefs.getString("laptop_ip", DEFAULT_IP);
    }

    private void loadLaptop() {
        String ip = getCurrentIp();
        String url = "http://" + ip + ":" + PORT;
        webView.loadUrl(url);
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void setIpAndReload(String newIp) {
            if (newIp != null && !newIp.trim().isEmpty()) {
                String cleanIp = newIp.trim().replace("http://", "").replace("https://", "").split(":")[0].replace("/", "");
                prefs.edit().putString("laptop_ip", cleanIp).apply();
                runOnUiThread(() -> loadLaptop());
            }
        }
    }

    private void loadErrorScreen(String attemptedIp) {
        String html = "<!DOCTYPE html><html lang='ar' dir='rtl'><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
                "<style>" +
                "*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;}" +
                "body{background:#0b0f19;color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}" +
                ".logo{font-size:48px;margin-bottom:12px;}" +
                "h2{font-size:20px;font-weight:800;color:#38bdf8;margin-bottom:8px;}" +
                "p{color:#94a3b8;font-size:13px;line-height:1.6;margin-bottom:20px;}" +
                ".card{background:rgba(22,30,49,0.95);border:1px solid rgba(56,189,248,0.3);border-radius:20px;padding:24px 20px;width:100%;max-width:360px;}" +
                "input{width:100%;padding:14px;border-radius:12px;border:1px solid rgba(56,189,248,0.4);background:#070d19;color:#38bdf8;font-size:16px;text-align:center;direction:ltr;margin-bottom:14px;outline:none;}" +
                "button{width:100%;background:linear-gradient(135deg,#0284c7,#6366f1);color:#fff;border:none;padding:14px;border-radius:12px;font-size:15px;font-weight:bold;cursor:pointer;}" +
                "button:active{transform:scale(0.98);}" +
                "</style></head><body>" +
                "<div class='logo'>📡</div>" +
                "<div class='card'>" +
                "<h2>تعذر الاتصال باللابتوب</h2>" +
                "<p>تأكد أن الهاتف واللابتوب متصلان بنفس شبكة الـ Wi-Fi، وأن VS Code مفتوح في اللابتوب.</p>" +
                "<input type='text' id='ipInput' value='" + attemptedIp + "' placeholder='192.168.100.43' />" +
                "<button onclick='retryConn()'>⚡ إعادة المحاولة</button>" +
                "</div>" +
                "<script>" +
                "function retryConn() {" +
                "  const val = document.getElementById('ipInput').value.trim();" +
                "  if (window.AndroidApp && window.AndroidApp.setIpAndReload) {" +
                "    window.AndroidApp.setIpAndReload(val);" +
                "  } else {" +
                "    window.location.href = 'http://' + val + ':38888';" +
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
