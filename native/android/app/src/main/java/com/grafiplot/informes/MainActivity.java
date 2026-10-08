package com.grafiplot.informes;
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
 private static final String URL="https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/trabajador.html";
 private WebView web;
 @Override public void onCreate(Bundle savedInstanceState){
  super.onCreate(savedInstanceState);
  web=new WebView(this); setContentView(web);
  WebView.setWebContentsDebuggingEnabled(false);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !URL.equals(request.getUrl().toString());}
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()){Toast.makeText(MainActivity.this,"Revisa tu conexión. Cierra y abre la aplicación para volver a intentar.",Toast.LENGTH_LONG).show();}}
  });
  web.loadUrl(URL);
 }
 @Override public void onBackPressed(){new android.app.AlertDialog.Builder(this).setMessage("¿Cerrar la aplicación? Tu borrador queda guardado.").setPositiveButton("Cerrar",(d,w)->finish()).setNegativeButton("Seguir",null).show();}
 @Override protected void onDestroy(){if(web!=null){web.destroy();}super.onDestroy();}
}
