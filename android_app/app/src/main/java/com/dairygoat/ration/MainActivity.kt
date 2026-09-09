package com.dairygoat.ration

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import java.io.InputStream

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var lastBackPressTime: Long = 0

    companion object {
        private const val TAG = "DairyGoatApp"
        private const val HOST = "appassets.androidplatform.net"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 根容器
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.WHITE)
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.WHITE)

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                useWideViewPort = true
                loadWithOverviewMode = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                textZoom = 100
                defaultTextEncodingName = "UTF-8"
            }

            // 开启远程调试与 Chrome Inspect
            WebView.setWebContentsDebuggingEnabled(true)

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    val uri = request.url

                    // 仅拦截本地域名，外部请求（云端 AI API）正常放行
                    if (uri.host == HOST || uri.host == "localhost" || uri.scheme == "file") {
                        val rawPath = (uri.path ?: "").trimStart('/')
                        val filename = if (rawPath.isEmpty() || rawPath == "index.html") "index.html" else rawPath

                        // 多路径全覆盖候选搜索
                        val searchPaths = listOf(
                            filename,
                            "dist/$filename",
                            "assets/$filename",
                            filename.removePrefix("assets/"),
                            "assets/" + filename.removePrefix("assets/"),
                            "dist/assets/" + filename.removePrefix("assets/"),
                            "dist/" + filename.removePrefix("assets/")
                        ).distinct()

                        for (candidate in searchPaths) {
                            try {
                                val stream: InputStream = this@MainActivity.assets.open(candidate)
                                val mimeType = getMimeType(candidate)
                                Log.i(TAG, "Local asset matched: $uri -> assets/$candidate ($mimeType)")
                                val response = WebResourceResponse(mimeType, "UTF-8", stream)
                                response.responseHeaders = mapOf(
                                    "Access-Control-Allow-Origin" to "*",
                                    "Access-Control-Allow-Methods" to "GET, POST, OPTIONS, HEAD",
                                    "Access-Control-Allow-Headers" to "*"
                                )
                                return response
                            } catch (_: Exception) {
                                // 继续尝试下一个候选路径
                            }
                        }
                        Log.w(TAG, "Asset not found: $uri among: $searchPaths")
                    }

                    // 外部网络请求放行
                    return null
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val url = request.url.toString()
                    if (url.startsWith("https://$HOST") || url.startsWith("file://")) {
                        return false
                    }
                    return try {
                        val intent = Intent(Intent.ACTION_VIEW, request.url)
                        startActivity(intent)
                        true
                    } catch (e: Exception) {
                        false
                    }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    progressBar.visibility = View.VISIBLE
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    progressBar.visibility = View.GONE
                    view?.evaluateJavascript("window.isAndroidApp = true;", null)
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    Log.e(TAG, "WebView error: ${error?.description} for ${request?.url}")
                    if (request?.isForMainFrame == true) {
                        view?.loadDataWithBaseURL(
                            null,
                            """
                            <!DOCTYPE html>
                            <html>
                            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
                            <body style="font-family:sans-serif;padding:32px 20px;text-align:center;color:#333;">
                                <div style="font-size:48px;margin-bottom:16px;">🐐</div>
                                <h3 style="color:#1f6f43;">奶山羊日粮配比助手</h3>
                                <p style="color:#666;font-size:14px;margin:12px 0 24px;">页面加载遇到异常，请点击重试：<br><small style="color:#999;">${error?.description}</small></p>
                                <button onclick="location.reload()" style="background:#1f6f43;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:15px;">重新加载</button>
                            </body>
                            </html>
                            """.trimIndent(),
                            "text/html",
                            "UTF-8",
                            null
                        )
                    }
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    Log.d("WebViewConsole", "${consoleMessage?.message()} (${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})")
                    return super.onConsoleMessage(consoleMessage)
                }

                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progressBar.progress = newProgress
                    if (newProgress >= 100) {
                        progressBar.visibility = View.GONE
                    }
                }
            }
        }

        // 顶部加载进度条
        progressBar = ProgressBar(
            this,
            null,
            android.R.attr.progressBarStyleHorizontal
        ).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                8
            )
            max = 100
            progress = 0
            visibility = View.VISIBLE
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        // 物理返回键处理
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    val now = System.currentTimeMillis()
                    if (now - lastBackPressTime < 2000) {
                        finish()
                    } else {
                        lastBackPressTime = now
                        Toast.makeText(this@MainActivity, "再按一次退出奶山羊日粮助手", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })

        // 启动加载首页
        webView.loadUrl("https://$HOST/index.html")
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".html", ignoreCase = true) -> "text/html"
            path.endsWith(".js", ignoreCase = true) || path.endsWith(".mjs", ignoreCase = true) -> "application/javascript"
            path.endsWith(".css", ignoreCase = true) -> "text/css"
            path.endsWith(".json", ignoreCase = true) -> "application/json"
            path.endsWith(".png", ignoreCase = true) -> "image/png"
            path.endsWith(".jpg", ignoreCase = true) || path.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
            path.endsWith(".svg", ignoreCase = true) -> "image/svg+xml"
            path.endsWith(".ico", ignoreCase = true) -> "image/x-icon"
            path.endsWith(".woff", ignoreCase = true) -> "font/woff"
            path.endsWith(".woff2", ignoreCase = true) -> "font/woff2"
            path.endsWith(".ttf", ignoreCase = true) -> "font/ttf"
            else -> "application/octet-stream"
        }
    }

    override fun onDestroy() {
        try {
            webView.stopLoading()
            webView.destroy()
        } catch (_: Exception) {
        }
        super.onDestroy()
    }
}
