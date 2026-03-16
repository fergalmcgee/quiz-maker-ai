import React, { useState } from 'react';
import classNames from 'classnames';
import { LogIn, UserPlus } from 'lucide-react';

export default function Login({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            // Standard login
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');

            onLogin(data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '4rem auto', backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
                Sign In
            </h2>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '1rem' }}
                        required
                    />
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '1rem' }}
                        required
                    />
                </div>

                {error && <div style={{ color: '#EF4444', padding: '0.5rem', backgroundColor: '#FEE2E2', borderRadius: 'var(--radius-sm)' }}>{error}</div>}
                {successMsg && <div style={{ color: '#10B981', padding: '0.5rem', backgroundColor: '#D1FAE5', borderRadius: 'var(--radius-sm)' }}>{successMsg}</div>}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        backgroundColor: 'var(--primary)', color: 'white', padding: '1rem',
                        borderRadius: 'var(--radius-md)', border: 'none', fontSize: '1rem',
                        fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                        transition: 'background-color 0.2s',
                        opacity: loading ? 0.7 : 1
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--primary-hover)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--primary)'}
                >
                    <LogIn size={20} />
                    {loading ? 'Processing...' : 'Sign In'}
                </button>
            </form>
        </div>
    );
}
