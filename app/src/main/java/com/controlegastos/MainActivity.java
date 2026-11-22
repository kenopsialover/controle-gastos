package com.controlegastos;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Abre as telas (HTML em assets/www) dentro de um WebView e liga o JavaScript ao banco SQLite. */
public class MainActivity extends Activity {
    private WebView web;

    @Override protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().setStatusBarColor(0xFF10302A);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        web.addJavascriptInterface(new Banco(this), "Android");
        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/www/index.html");
    }

    // O botão voltar navega entre as telas; na tela inicial fecha o app.
    @Override public void onBackPressed() {
        web.evaluateJavascript("(window.voltar ? window.voltar() : false)", r -> {
            if (!"true".equals(r)) finish();
        });
    }
}
