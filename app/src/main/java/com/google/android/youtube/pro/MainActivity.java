package com.google.android.youtube.pro;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.webkit.CookieManager;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.cardview.widget.CardView;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.floatingactionbutton.FloatingActionButton;

// Import the separated components
import com.google.android.youtube.pro.webview.YTProWebView;
import com.google.android.youtube.pro.webview.YTProWebViewClient;
import com.google.android.youtube.pro.webview.YTProWebChromeClient;
import com.google.android.youtube.pro.webview.WebAppInterface;
import com.google.android.youtube.pro.webview.BinaryStreamManager;

import com.google.android.youtube.pro.receivers.MediaCommandReceiver;

public class MainActivity extends AppCompatActivity {

    public boolean portrait = false;
    public boolean isPlaying = false;
    public boolean mediaSession = false;
    public boolean isPip = false;
    public boolean dL = false;

    private YTProWebView web;
    private MediaCommandReceiver broadcastReceiver;
    private OnBackInvokedCallback backCallback;
    public BinaryStreamManager streamManager;

    private MaterialToolbar toolbar;
    private ProgressBar progressBar;
    private CardView welcomeCard;
    private MaterialButton buttonOpen;
    private MaterialButton buttonTheme;
    private FloatingActionButton fab;
    private TextView welcomeTitle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.main);

        SharedPreferences prefs = getSharedPreferences("YTPRO", MODE_PRIVATE);
        if (!prefs.contains("bgplay")) {
            prefs.edit().putBoolean("bgplay", true).apply();
        }
        if (!prefs.contains("themeMode")) {
            prefs.edit().putInt("themeMode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM).apply();
        } else {
            AppCompatDelegate.setDefaultNightMode(prefs.getInt("themeMode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM));
        }

        initViews();

        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent intent = getIntent();
        if (hasYouTubeIntent(intent)) {
            startWebView(getInitialUrl(intent));
        } else {
            showWelcomeScreen();
        }
    }

    public void load(boolean dl) {
              
        
        this.dL = dl;
        web = findViewById(R.id.web);
        configureWebViewSettings();

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(web, true);
        }

        web.addJavascriptInterface(new WebAppInterface(this, web), "Android");
        web.setWebChromeClient(new YTProWebChromeClient(this, web));
        web.setWebViewClient(new YTProWebViewClient(this, web));

        setupReceiver();
        setupBackNavigation();
        streamManager = new BinaryStreamManager(web,this);
        
        
    }
         

    private void configureWebViewSettings() {
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setSupportZoom(true);
        web.getSettings().setBuiltInZoomControls(true);
        web.getSettings().setDisplayZoomControls(false);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setDatabaseEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            web.getSettings().setAllowFileAccessFromFileURLs(false);
            web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.getSettings().setSafeBrowsingEnabled(true);
        }
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
    }

    private String getInitialUrl(Intent intent) {
        String action = intent.getAction();
        Uri data = intent.getData();
        String url = "https://m.youtube.com/";

        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String candidate = data.toString();
            if (isTrustedYouTubeUrl(candidate)) {
                url = candidate;
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String extracted = extractYouTubeUrl(sharedText);
            if (extracted != null) {
                url = extracted;
            }
        }
        return url;
    }

    private boolean isTrustedYouTubeUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.endsWith("youtube.com") || host.endsWith("youtu.be");
        } catch (Exception e) {
            return false;
        }
    }

    private String extractYouTubeUrl(String sharedText) {
        if (sharedText == null) return null;
        for (String part : sharedText.split("\\s+")) {
            if (part.contains("youtube.com") || part.contains("youtu.be")) {
                String candidate = part;
                if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
                    candidate = "https://" + candidate;
                }
                if (isTrustedYouTubeUrl(candidate)) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private void setupReceiver() {
        broadcastReceiver = new MediaCommandReceiver(web);
        if (Build.VERSION.SDK_INT >= 34 && getApplicationInfo().targetSdkVersion >= 34) {
            registerReceiver(broadcastReceiver, new IntentFilter("TRACKS_TRACKS"), RECEIVER_EXPORTED);
        } else {
            registerReceiver(broadcastReceiver, new IntentFilter("TRACKS_TRACKS"));
        }
    }

    private void setupBackNavigation() {
        if (Build.VERSION.SDK_INT >= 33) {
            OnBackInvokedDispatcher dispatcher = getOnBackInvokedDispatcher();
            backCallback = new OnBackInvokedCallback() {
                @Override
                public void onBackInvoked() {
                    handleBackPress();
                }
            };
            dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    private void handleBackPress() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        if (welcomeCard.getVisibility() == View.VISIBLE) {
            finish();
        } else {
            handleBackPress();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 101) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                web.loadUrl("https://m.youtube.com");
            } else {
                Toast.makeText(getApplicationContext(), getString(R.string.grant_mic), Toast.LENGTH_SHORT).show();
            }
        } else if (requestCode == 1) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_DENIED) {
                Toast.makeText(getApplicationContext(), getString(R.string.grant_storage), Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.top_app_bar_menu, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_refresh) {
            if (web != null) {
                web.reload();
            }
            return true;
        } else if (id == R.id.action_back) {
            handleBackPress();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    public void updateProgress(int progress) {
        if (progressBar == null) return;
        if (progress >= 100) {
            progressBar.setVisibility(View.GONE);
        } else {
            progressBar.setVisibility(View.VISIBLE);
            progressBar.setProgress(progress);
        }
    }

    private void initViews() {
        toolbar = findViewById(R.id.topAppBar);
        setSupportActionBar(toolbar);

        progressBar = findViewById(R.id.progressBar);
        welcomeCard = findViewById(R.id.welcomeCard);
        buttonOpen = findViewById(R.id.buttonOpen);
        buttonTheme = findViewById(R.id.buttonTheme);
        fab = findViewById(R.id.fab);
        welcomeTitle = findViewById(R.id.welcomeTitle);

        buttonOpen.setOnClickListener(v -> {
            hideWelcomeScreen();
            startWebView("https://m.youtube.com/");
        });

        buttonTheme.setOnClickListener(v -> {
            SharedPreferences prefs = getSharedPreferences("YTPRO", MODE_PRIVATE);
            int currentMode = prefs.getInt("themeMode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
            int nextMode = currentMode == AppCompatDelegate.MODE_NIGHT_NO ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO;
            prefs.edit().putInt("themeMode", nextMode).apply();
            AppCompatDelegate.setDefaultNightMode(nextMode);
            recreate();
        });

        fab.setOnClickListener(v -> {
            if (web != null && web.getVisibility() == View.VISIBLE) {
                web.reload();
            } else {
                hideWelcomeScreen();
                startWebView("https://m.youtube.com/");
            }
        });
    }

    private boolean hasYouTubeIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(action) && data != null) return true;
        if (Intent.ACTION_SEND.equals(action)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            return extractYouTubeUrl(sharedText) != null;
        }
        return false;
    }

    private void showWelcomeScreen() {
        welcomeCard.setVisibility(View.VISIBLE);
        if (web != null) {
            web.setVisibility(View.GONE);
        }
    }

    private void hideWelcomeScreen() {
        welcomeCard.setVisibility(View.GONE);
        if (web != null) {
            web.setVisibility(View.VISIBLE);
        }
    }

    private void startWebView(String url) {
        hideWelcomeScreen();
        load(false);
        if (web != null) {
            web.loadUrl(url);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        web.evaluateJavascript(isInPictureInPictureMode ? "PIPlayer();" : "removePIP();", null);
        isPip = isInPictureInPictureMode;
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= 26 && web.getUrl() != null && web.getUrl().contains("watch")) {
            if (isPlaying) {
                try {
                    isPip = true;
                    PictureInPictureParams params = new PictureInPictureParams.Builder()
                            .setAspectRatio(new Rational(portrait ? 9 : 16, portrait ? 16 : 9))
                            .build();
                    enterPictureInPictureMode(params);
                } catch (IllegalStateException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopService(new Intent(getApplicationContext(), ForegroundService.class));
        if (broadcastReceiver != null) unregisterReceiver(broadcastReceiver);
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (streamManager != null) {
            streamManager.cleanup();
        }
    }
}
