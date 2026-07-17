import crypto from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || 'spartan-cave-super-secret-key-9281';

/**
 * Verifies a stateless signed session token.
 */
export function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64').toString('utf8');
    const signature = parts[1];
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    const data = JSON.parse(payload);
    if (Date.now() > data.expiresAt) return null; // Token expired
    return data;
  } catch {
    return null;
  }
}

/**
 * Creates a stateless signed session token.
 */
export function createToken(username) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours validity
  const payload = JSON.stringify({ username, expiresAt });
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

/**
 * Express middleware to authenticate admin requests.
 */
export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token; // Allow token in query params for file downloads (Excel)
    
    const token = authHeader 
      ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader)
      : queryToken;

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No authorization token provided.' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired authorization token.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication process failed.' });
  }
}
