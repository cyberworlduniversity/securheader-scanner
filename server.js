const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { resolvePublicTarget, createPinnedAgents } = require('./target-safety');

const app = express();
app.use(cors());
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const HEADERS = {
  'content-security-policy':       { name: 'Content-Security-Policy',       risk: 'HIGH',   rec: "default-src 'self'; script-src 'self'" },
  'strict-transport-security':     { name: 'Strict-Transport-Security',      risk: 'HIGH',   rec: 'max-age=31536000; includeSubDomains; preload' },
  'x-frame-options':               { name: 'X-Frame-Options',                risk: 'MEDIUM', rec: 'DENY or SAMEORIGIN' },
  'x-content-type-options':        { name: 'X-Content-Type-Options',         risk: 'MEDIUM', rec: 'nosniff' },
  'x-xss-protection':              { name: 'X-XSS-Protection',               risk: 'LOW',    rec: '1; mode=block' },
  'referrer-policy':               { name: 'Referrer-Policy',                risk: 'LOW',    rec: 'no-referrer or strict-origin-when-cross-origin' },
  'permissions-policy':            { name: 'Permissions-Policy',             risk: 'LOW',    rec: 'geolocation=(), microphone=(), camera=()' },
  'cross-origin-opener-policy':    { name: 'Cross-Origin-Opener-Policy',     risk: 'LOW',    rec: 'same-origin' },
};

app.post('/api/scan', async (req, res) => {
  let target;
  try {
    target = await resolvePublicTarget(req.body && req.body.url);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid or blocked target URL.' });
  }

  try {
    const agents = createPinnedAgents(target);
    const response = await axios.get(target.url.toString(), {
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: 65536,
      responseType: 'stream',
      validateStatus: () => true,
      httpAgent: agents.httpAgent,
      httpsAgent: agents.httpsAgent,
      headers: { 'User-Agent': 'SecureHeaderScanner/1.0' },
    });
    if (response.data && typeof response.data.destroy === 'function') {
      response.data.destroy();
    }

    const results = Object.entries(HEADERS).map(([key, meta]) => {
      const value = response.headers[key];
      return {
        key, name: meta.name, value: value || null,
        status: value ? 'secure' : 'missing',
        risk: value ? 'NONE' : meta.risk,
        recommendation: value ? null : `Set: ${key}: ${meta.rec}`,
      };
    });

    const secure = results.filter(r => r.status === 'secure').length;
    res.json({
      url: target.url.toString(), statusCode: response.status,
      score: Math.round((secure / results.length) * 100),
      summary: { secure, missing: results.length - secure, total: results.length },
      results,
    });
  } catch (err) {
    res.status(400).json({ error: 'Could not reach the URL. Please check and try again.' });
  }
});

app.listen(5000, () => console.log('SecureHeader Scanner running on http://localhost:5000'));
