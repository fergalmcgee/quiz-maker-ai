import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, CheckCircle, Key } from 'lucide-react';

export default function StudentDashboard({ user }) {
    const [sessions, setSessions] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/sessions/student/${user.id}`);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const activeSessions = sessions.filter(s => s.status === 'active' && s.is_archived === 0);
    const pastSessions = sessions.filter(s => s.status === 'completed' || s.is_archived === 1);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`http://localhost:3001/api/users/${user.id}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            });
            if (res.ok) {
                setPasswordMessage('Password updated successfully!');
                setTimeout(() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setPasswordMessage('');
                }, 2000);
            } else {
                const data = await res.json();
                setPasswordMessage(data.error || 'Failed to update password.');
            }
        } catch (e) {
            setPasswordMessage('Error updating password.');
        }
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ marginTop: 0 }}>Student Dashboard</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Welcome, {user.username}. Here are your assigned tasks:</p>
                </div>
                <button
                    onClick={() => setShowPasswordModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}
                >
                    <Key size={16} /> Change Password
                </button>
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Live Sessions Happening Now</h3>
                {activeSessions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        No live sessions or assigned quizzes right now.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        {activeSessions.map(s => (
                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{s.name || `Live Session #${s.id}`}</h4>
                                    <p style={{ margin: '0.25rem 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                        Class: {s.class_name} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.9rem' }}>(Teacher: {s.teacher_name})</span>
                                    </p>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status: Active</p>
                                </div>
                                <button
                                    onClick={() => navigate(`/student/live/${s.id}`)}
                                    style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <PlayCircle size={18} /> Join Now
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Past Test Results</h3>
                {pastSessions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        You haven't completed any tracked quizzes yet.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        {pastSessions.map(s => (
                            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{s.name || `Session #${s.id}`}</h4>
                                    <p style={{ margin: '0.25rem 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                        Class: {s.class_name} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.9rem' }}>(Teacher: {s.teacher_name})</span>
                                    </p>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status: Completed / Archived</p>
                                </div>
                                <button
                                    onClick={() => navigate(`/student/live/${s.id}`)}
                                    style={{ backgroundColor: 'transparent', color: 'var(--secondary)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--secondary)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <CheckCircle size={18} /> View Results
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <button onClick={fetchSessions} style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer' }}>Refresh Sessions</button>
            </div>

            {showPasswordModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '400px', boxShadow: 'var(--shadow-lg)' }}>
                        <h3 style={{ marginTop: 0 }}>Change Password</h3>
                        <form onSubmit={handleChangePassword}>
                            <input
                                type="password"
                                placeholder="Enter New Password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                required
                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '1rem', fontSize: '1rem' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button type="button" onClick={() => setShowPasswordModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Update Password</button>
                            </div>
                            {passwordMessage && <p style={{ marginTop: '1rem', color: passwordMessage.includes('successfully') ? '#10B981' : '#EF4444', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>{passwordMessage}</p>}
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
