package com.grafiplot.administrador;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import android.widget.Toast;
public class MainActivity extends Activity {
 private static final String HOME="https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/";
 private WebView web;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);web=new WebView(this);setContentView(web);
  WebView.setWebContentsDebuggingEnabled(false);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !r.getUrl().toString().startsWith(HOME);}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())Toast.makeText(MainActivity.this,"Revisa tu conexión",Toast.LENGTH_LONG).show();}
  });web.loadUrl(HOME);
 }
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
