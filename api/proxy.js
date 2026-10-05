import fetch from 'node-fetch';

const AD_PATTERNS = [
  "googlesyndication.com", "doubleclick.net", "googleadservices.com",
  "google-analytics.com", "googletagmanager.com", "googletagservices.com",
  "://google.com", "://googlesyndication.com", "://googlesyndication.com",
  "://googlesyndication.com", "://google.com", "://google.com",
  "://ads-twitter.com", "://twitter.com", "://facebook.com",
  "://facebook.com", "adnxs.com", "advertising.com", "outbrain.com",
  "taboola.com", "criteo.com", "pubmatic.com", "rubiconproject.com",
  "openx.net", "adsafeprotected.com", "moatads.com", "scorecardresearch.com",
  "/ads/", "/ad/", "/advert/", "/advertisement/", "/adsense/", "/adserver/",
  "/analytics/", "prebid", "advertis", "banner", "popup"
];

function isAdRequest(url) {
  const urlLower = url.toLowerCase();
  return AD_PATTERNS.some((pattern) => urlLower.includes(pattern));
}

export default async function handler(req, res) {
  const { url: reqUrl, method, headers } = req;
  const url = new URL(reqUrl, `https://${headers.host}`);
  const pathname = url.pathname;

  // Handle Static Asset Routes
  if (pathname === "/" || pathname === "") {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Permissions-Policy", "accelerometer=*, gyroscope=*, camera=*, microphone=*, geolocation=*, hid=*, midi=*, clipboard-read=*, clipboard-write=*, xr-spatial-tracking=*, gamepad=*");
    return res.status(200).send(getMainHTML());
  }
  if (pathname === "/manifest.json") {
    res.setHeader("Content-Type", "application/manifest+json");
    return res.status(200).send(getManifest());
  }
  if (pathname === "/sw.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    return res.status(200).send(getServiceWorker());
  }

  // Handle Favicons & Icons
  if (["/favicon.png", "/icon.svg", "/icon-192.png", "/icon-512.png"].includes(pathname)) {
    let target = "https://gstatic.com";
    if (pathname === "/icon.svg") target = "https://gstatic.com";
    if (pathname === "/icon-192.png") target = "https://gstatic.com";
    if (pathname === "/icon-512.png") target = "https://gstatic.com";

    try {
      let iconRes = await fetch(target);
      if (!iconRes.ok && target !== "https://gstatic.com") {
        iconRes = await fetch("https://gstatic.com");
      }
      const buffer = await iconRes.arrayBuffer();
      res.setHeader("Content-Type", pathname.endsWith(".svg") ? "image/svg+xml" : "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(iconRes.status).send(Buffer.from(buffer));
    } catch {
      return res.status(404).end();
    }
  }

  // Proxy Routing Logic
  let targetURL;
  if (pathname.startsWith("/proxy/")) {
    const encodedURL = pathname.substring("/proxy/".length);
    try {
      targetURL = decodeURIComponent(encodedURL) + url.search;
    } catch {
      return res.status(400).send("Invalid proxy URL");
    }
  } else {
    targetURL = "https://cloudmoonapp.com" + pathname + url.search;
  }

  if (isAdRequest(targetURL)) {
    return res.status(204).end();
  }

  // Forward Headers safely without Cloudflare system constraints
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!["host", "connection", "cf-connecting-ip", "cf-ray", "x-forwarded-proto", "x-real-ip"].includes(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  }
  forwardHeaders["host"] = new URL(targetURL).host;
  if (!forwardHeaders["user-agent"]) {
    forwardHeaders["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }

  try {
    const response = await fetch(targetURL, {
      method,
      headers: forwardHeaders,
      redirect: "follow"
    });

    // Copy remote response headers to client
    response.headers.forEach((val, key) => {
      if (!["content-security-policy", "x-frame-options", "frame-options", "content-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      let html = await response.text();
      html = blockAdsInHTML(html) + getInjectedScript();
      return res.status(response.status).send(html);
    } else {
      const buffer = await response.arrayBuffer();
      return res.status(response.status).send(Buffer.from(buffer));
    }
  } catch (error) {
    return res.status(502).send("Failed to fetch resource: " + error.message);
  }
}

function blockAdsInHTML(html) {
  return html
    .replace(/<script[^>]*googlesyndication[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*adsbygoogle[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*google-analytics[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*googletagmanager[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*doubleclick[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[^>]*googlesyndication[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[^>]*doubleclick[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, "")
    .replace(/<div[^>]*id="google_ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
}

function getInjectedScript() {
  return `
<style id="cm-ad-blocker-css">
  .a-div-horizontal, .a-div-vertical, .a-div-placeholder, .a-div-box {
    display: none !important; visibility: hidden !important; opacity: 0 !important;
  }
</style>
<script>
(function(){
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    if (typeof args[0] === 'string' && /googlesyndication|doubleclick|googleadservices|analytics|adsense/i.test(args[0])) {
      return Promise.reject(new Error('Ad blocked'));
    }
    return originalFetch.apply(this, args);
  };
  function fixButtons() { 
    document.querySelectorAll("button.google-button, button.apple-button").forEach(btn => {
      let style = btn.getAttribute("style") || "";
      if (style.includes("123, 108, 196") || style.includes("123,108,196")) {
        btn.style.setProperty("display", "flex", "important");
      } else if (style.includes("255, 255, 255") || btn.querySelector("svg")) {
        btn.style.setProperty("display", "none", "important");
      }
    });
  }
  setInterval(fixButtons, 200);
})();
</script>`;
}

function getMainHTML() { return \`${getMainHTMLString()}\`; }
function getManifest() { return \`${getManifestString()}\`; }
function getServiceWorker() { return \`${getServiceWorkerString()}\`; }

// String definitions extracted directly from your worker code
function getMainHTMLString() {
  return \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - Classroom</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" id="favicon" type="image/png" href="/favicon.png">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #0d1117; color: #c9d1d9; overflow: hidden; }
        #container { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
        #frame-container { flex: 1; width: 100%; height: 100%; background: white; }
        iframe { width: 100%; height: 100%; border: none; }
        #btn-dock { position: fixed; bottom: 18px; left: 18px; display: flex; gap: 10px; z-index: 9999; }
        .dock-btn { width: 44px; height: 44px; border-radius: 50%; border: none; background: rgba(45, 45, 45, 0.85); color: #e0e0e0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    </style>
</head>
<body>
    <div id="container"><div id="frame-container"></div></div>
    <div id="btn-dock">
        <button class="dock-btn" onclick="goBack()">🏠</button>
        <button class="dock-btn" onclick="enterFullscreen()">📺</button>
    </div>
    <script>
        const frameContainer = document.getElementById('frame-container');
        let mainURL = '/proxy/' + encodeURIComponent('https://cloudmoonapp.com/');
        
        function createIframe(url) {
            frameContainer.innerHTML = '<iframe id="game-frame" src="' + url + '" allow="gamepad; clipboard-read; clipboard-write; fullscreen"></iframe>';
        }
        createIframe(mainURL);
        function goBack() { createIframe(mainURL); }
        function enterFullscreen() {
            const frame = document.getElementById('game-frame');
            if(frame.requestFullscreen) frame.requestFullscreen();
        }
    </script>
</body>
</html>\`;
}

function getManifestString() {
  return JSON.stringify({
    "name": "Google Classroom",
    "short_name": "Classroom",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0d1117",
    "theme_color": "#2d2d2d",
    "icons": [{ "src": "/favicon.png", "sizes": "192x192", "type": "image/png" }]
  });
}

function getServiceWorkerString() {
  return \`self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {});\`;
}
