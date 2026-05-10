import crypto from 'crypto';
import { queryDb } from './database.js';

const SESSION_COOKIE = 'quiz_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(cookieHeader = '') {
    return cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const eqIndex = part.indexOf('=');
            if (eqIndex === -1) return acc;
            const key = part.slice(0, eqIndex);
            const value = decodeURIComponent(part.slice(eqIndex + 1));
            acc[key] = value;
            return acc;
        }, {});
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getExpiredCookie() {
    const parts = [
        `${SESSION_COOKIE}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ];

    if (process.env.NODE_ENV === 'production') {
        parts.push('Secure');
    }

    return parts.join('; ');
}

async function deleteExpiredSessions() {
    try {
        await queryDb.run('DELETE FROM login_sessions WHERE expires_at < ?', [Date.now()]);
    } catch (error) {
        console.error('Failed to clear expired login sessions:', error);
    }
}

async function getSession(token) {
    if (!token) return null;

    const tokenHash = hashToken(token);
    const session = await queryDb.get(`
        SELECT
            ls.token_hash,
            ls.expires_at,
            u.id,
            u.username,
            u.role,
            u.is_approved
        FROM login_sessions ls
        JOIN users u ON u.id = ls.user_id
        WHERE ls.token_hash = ?
    `, [tokenHash]);

    if (!session) return null;

    if (session.expires_at < Date.now()) {
        await queryDb.run('DELETE FROM login_sessions WHERE token_hash = ?', [tokenHash]);
        return null;
    }

    if (session.role === 'teacher' && session.is_approved === 0) {
        await queryDb.run('DELETE FROM login_sessions WHERE token_hash = ?', [tokenHash]);
        return null;
    }

    return {
        user: {
            id: String(session.id),
            username: session.username,
            role: session.role
        },
        expiresAt: session.expires_at
    };
}

function buildCookie(token, maxAgeSeconds) {
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`
    ];

    if (process.env.NODE_ENV === 'production') {
        parts.push('Secure');
    }

    return parts.join('; ');
}

export async function createLoginSession(res, user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;

    await queryDb.run(
        'INSERT INTO login_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
        [tokenHash, user.id, expiresAt]
    );
    res.setHeader('Set-Cookie', buildCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
    deleteExpiredSessions();
}

export async function clearLoginSession(req, res) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[SESSION_COOKIE];
    res.setHeader('Set-Cookie', getExpiredCookie());

    if (token) {
        try {
            await queryDb.run('DELETE FROM login_sessions WHERE token_hash = ?', [hashToken(token)]);
        } catch (error) {
            console.error('Failed to clear login session:', error);
        }
    }
}

export async function authenticateRequest(req, _res, next) {
    try {
        const cookies = parseCookies(req.headers.cookie || '');
        const token = cookies[SESSION_COOKIE];
        const session = await getSession(token);
        req.user = session ? session.user : null;
    } catch (error) {
        console.error('Authentication check failed:', error);
        req.user = null;
    }
    next();
}

export function authorize(roles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const normalizedRoles = roles.map(role => role.trim().toLowerCase());
        if (normalizedRoles.length && !normalizedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Forbidden: Role '${req.user.role}' is not authorized for this action. Required one of: ${normalizedRoles.join(', ')}`
            });
        }

        next();
    };
}

export async function authenticateSocket(socket, next) {
    try {
        const cookies = parseCookies(socket.handshake.headers.cookie || '');
        const token = cookies[SESSION_COOKIE];
        const session = await getSession(token);

        if (!session) {
            return next(new Error('Unauthorized'));
        }

        socket.user = session.user;
        next();
    } catch (error) {
        console.error('Socket authentication failed:', error);
        next(new Error('Unauthorized'));
    }
}
