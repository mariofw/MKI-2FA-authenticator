const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

const SECRETS_FILE = path.join(__dirname, 'secrets.json');

// Read secrets file or return empty object
async function readSecrets() {
  try {
    const raw = await fs.readFile(SECRETS_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeSecrets(obj) {
  await fs.writeFile(SECRETS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// Helper to build a canonical otpauth url (works regardless of speakeasy version)
function buildOtpauthUrl({ secret, label = 'SecureApp', userEmail, issuer = 'SecureApp', algorithm = 'SHA1', digits = 6, period = 30 }) {
  // label portion: issuer:account? OR just label(account) — keep it readable
  const encodedLabel = `${encodeURIComponent(label)}:${encodeURIComponent(userEmail)}`;
  const params = [
    `secret=${encodeURIComponent(secret)}`,
    `issuer=${encodeURIComponent(issuer)}`,
    `algorithm=${encodeURIComponent(algorithm)}`,
    `digits=${encodeURIComponent(digits)}`,
    `period=${encodeURIComponent(period)}`
  ].join('&');

  return `otpauth://totp/${encodedLabel}?${params}`;
}

// Ensure secrets.json exists (create empty if absent)
(async () => {
  try {
    const s = await readSecrets();
    if (!s) await writeSecrets({});
  } catch (err) {
    console.error('Error ensuring secrets file:', err);
  }
})();

// GET /api/generate-2fa?email=...
app.get('/api/generate-2fa', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const secrets = await readSecrets();

    // if no secret for this user, generate and persist it
    if (!secrets[email]) {
      const secretObj = speakeasy.generateSecret({ length: 20 });
      // use base32 secret
      secrets[email] = secretObj.base32;
      await writeSecrets(secrets);
      console.log(`Generated new secret for ${email}`);
    }

    const secret = secrets[email];

    // Build otpauth url manually — guaranteed format
    const otpauthUrl = buildOtpauthUrl({
      secret,
      label: 'AlatBayar',
      userEmail: email,
      issuer: 'AlatBayar',
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    });

    // Create QR code data URL
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

    // ONLY send back the image data URL — do not reveal the secret
    return res.json({ qrCodeDataURL });
  } catch (err) {
    console.error('Error in /api/generate-2fa:', err);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// POST /api/verify-2fa  { email, token }
app.post('/api/verify-2fa', async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) return res.status(400).json({ error: 'Email and token are required' });

  try {
    const secrets = await readSecrets();
    const secret = secrets[email];
    if (!secret) return res.status(400).json({ verified: false, error: 'No 2FA setup for this user' });

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1 // tolerate small clock skew
    });

    return res.json({ verified: !!verified });
  } catch (err) {
    console.error('Error in /api/verify-2fa:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// Optional: serve static pages if you want to open via backend directly
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/setup-2fa', (req, res) => res.sendFile(path.join(__dirname, 'setup-2fa.html')));

const PORT = 5500;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
