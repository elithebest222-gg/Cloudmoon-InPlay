export default async function handler(req, res) {
  // Grab the exact path the browser is looking for
  const url = new URL(req.url, `https://${req.headers.host}`);
  const targetUrl = 'https://cloudmoon.com' + url.pathname + url.search;

  try {
    // Fetch the game data from Cloudmoon safely
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        'host': '://cloudmoon.com',
        'origin': 'https://cloudmoon.com',
        'referer': 'https://cloudmoon.com/'
      }
    });

    const contentType = response.headers.get('content-type') || '';

    // If it's a web page, send it back as text
    if (contentType.includes('text') || contentType.includes('json') || contentType.includes('javascript')) {
      let body = await response.text();
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(body);
    } else {
      // If it's an image/game asset, send it as raw binary data
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      return res.status(response.status).send(Buffer.from(buffer));
    }
  } catch (error) {
    return res.status(500).send("Proxy configuration error: " + error.message);
  }
}
