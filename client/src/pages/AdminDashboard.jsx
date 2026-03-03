import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, UserX, KeyRound, UserPlus, FileText } from 'lucide-react';

export default function AdminDashboard({ user }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmAction, setConfirmAction] = useState(null);
    const [newPasswordValue, setNewPasswordValue] = useState('');

    const [activeTab, setActiveTab] = useState('users'); // 'users', 'add', 'bulk'

    // Add User State
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFormClass, setNewFormClass] = useState('');
    const [newUserRole, setNewUserRole] = useState('student');

    // Bulk Import State
    const [bulkText, setBulkText] = useState('');
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('http://localhost:3001/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            const res = await fetch(`http://localhost:3001/api/admin/users/${id}/approve`, {
                method: 'PUT'
            });
            if (!res.ok) throw new Error('Failed to approve user');
            fetchUsers();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`http://localhost:3001/api/admin/users/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete user');
            fetchUsers();
            setConfirmAction(null);
        } catch (err) {
            alert(err.message);
        }
    };

    const handleResetPassword = async (id) => {
        if (!newPasswordValue) return;

        try {
            const res = await fetch(`http://localhost:3001/api/admin/users/${id}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: newPasswordValue })
            });
            if (!res.ok) throw new Error('Failed to reset password');
            setConfirmAction(null);
            setNewPasswordValue('');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3001/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    role: newUserRole,
                    form_class: newFormClass,
                    createdBy: user.id
                })
            });
            if (res.ok) {
                setNewUsername('');
                setNewPassword('');
                setNewFormClass('');
                setNewUserRole('student');
                fetchUsers();
                setActiveTab('users');
            } else {
                const errData = await res.json();
                alert(`Error: ${errData.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleBulkImport = async (e) => {
        e.preventDefault();
        setImporting(true);
        try {
            const res = await fetch('http://localhost:3001/api/students/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bulkText, createdBy: user.id })
            });
            if (res.ok) {
                const data = await res.json();
                setBulkText('');
                fetchUsers();
                alert(`Success: Imported ${data.studentsImported} students!`);
                setActiveTab('users');
            } else {
                const errData = await res.json();
                alert(`Error: ${errData.error || 'Failed to import students'}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setImporting(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading admin dashboard...</div>;
    if (error) return <div style={{ padding: '2rem', color: 'red', textAlign: 'center' }}>Error: {error}</div>;

    const pendingTeachers = users.filter(u => u.role === 'teacher' && u.is_approved === 0);
    const allOtherUsers = users.filter(u => !(u.role === 'teacher' && u.is_approved === 0) && u.id !== user.id); // Exclude self

    return (
        <div style={{ maxWidth: '1000px', margin: '2rem auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={28} /> Admin Control Panel</h2>
                <p style={{ color: 'var(--text-muted)' }}>Manage teachers, students, and system access.</p>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button onClick={() => setActiveTab('users')} style={{ ...navTabStyle, ...(activeTab === 'users' ? activeNavTabStyle : {}) }}>
                    <Users size={18} /> Manage Users
                </button>
                <button onClick={() => setActiveTab('add')} style={{ ...navTabStyle, ...(activeTab === 'add' ? activeNavTabStyle : {}) }}>
                    <UserPlus size={18} /> Add User
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    style={activeTab === 'bulk' ? { ...navTabStyle, ...activeNavTabStyle } : navTabStyle}
                >
                    <FileText size={18} /> Bulk Create Students
                </button>
            </div>

            {activeTab === 'users' && (
                <div className="fade-in">
                    {/* Pending Teachers Section */}
                    {pendingTeachers.length > 0 && (
                        <div style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem', border: '1px solid #FCD34D' }}>
                            <h3 style={{ color: '#B45309', marginTop: 0 }}>Pending Teacher Approvals ({pendingTeachers.length})</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>These teachers have registered but cannot log in until approved.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {pendingTeachers.map(teacher => (
                                    <div key={teacher.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                        <div>
                                            <strong style={{ fontSize: '1.1rem' }}>{teacher.username}</strong>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Registered: {new Date(teacher.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {confirmAction?.type === 'reject' && confirmAction?.id === teacher.id ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 600 }}>Sure?</span>
                                                    <button onClick={() => handleDelete(teacher.id)} style={{ ...actionBtnStyle('#DC2626', '#FEE2E2', '#DC2626'), backgroundColor: '#DC2626', color: 'white' }}>
                                                        Yes
                                                    </button>
                                                    <button onClick={() => setConfirmAction(null)} style={actionBtnStyle('var(--text-main)', 'var(--background)', 'var(--border)')}>
                                                        No
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button onClick={() => setConfirmAction({ type: 'reject', id: teacher.id })} style={actionBtnStyle('#EF4444', '#FEE2E2', '#DC2626')}>
                                                        <UserX size={16} /> Reject
                                                    </button>
                                                    <button onClick={() => handleApprove(teacher.id)} style={{ ...actionBtnStyle('#10B981', '#D1FAE5', '#059669'), backgroundColor: '#10B981', color: 'white' }}>
                                                        <CheckCircle size={16} /> Approve
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* All Users Section */}
                    <div style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                        <h3 style={{ marginTop: 0 }}>All Registered Users</h3>

                        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={thStyle}>ID</th>
                                        <th style={thStyle}>Username</th>
                                        <th style={thStyle}>Role</th>
                                        <th style={thStyle}>Form Class</th>
                                        <th style={thStyle}>Created By</th>
                                        <th style={thStyle}>Joined</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allOtherUsers.length === 0 ? (
                                        <tr><td colSpan="6" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No other users found.</td></tr>
                                    ) : allOtherUsers.map(u => (
                                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={tdStyle}>{u.id}</td>
                                            <td style={tdStyle}><strong>{u.username}</strong></td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600,
                                                    backgroundColor: u.role === 'admin' ? '#E0E7FF' : u.role === 'teacher' ? '#ECFCCB' : '#F3F4F6',
                                                    color: u.role === 'admin' ? '#4338CA' : u.role === 'teacher' ? '#4D7C0F' : '#374151'
                                                }}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>{u.form_class || '-'}</td>
                                            <td style={tdStyle}>{u.creator_name || '-'}</td>
                                            <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {confirmAction?.type === 'reset' && confirmAction?.id === u.id && (
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <input type="password" placeholder="New Password" value={newPasswordValue} onChange={e => setNewPasswordValue(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} autoFocus />
                                                            <button onClick={() => handleResetPassword(u.id)} style={{ ...actionBtnStyle('#10B981', '#10B981', '#10B981'), backgroundColor: '#10B981', color: 'white' }}>Save</button>
                                                            <button onClick={() => { setConfirmAction(null); setNewPasswordValue(''); }} style={actionBtnStyle('var(--text-main)', 'var(--background)', 'var(--text-muted)')}>Cancel</button>
                                                        </div>
                                                    )}
                                                    {confirmAction?.type === 'delete' && confirmAction?.id === u.id && (
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 600 }}>Delete?</span>
                                                            <button onClick={() => handleDelete(u.id)} style={{ ...actionBtnStyle('#DC2626', '#DC2626', '#DC2626'), backgroundColor: '#DC2626', color: 'white' }}>Yes</button>
                                                            <button onClick={() => setConfirmAction(null)} style={actionBtnStyle('var(--text-main)', 'var(--background)', 'var(--text-muted)')}>No</button>
                                                        </div>
                                                    )}
                                                    {(!confirmAction || confirmAction.id !== u.id) && (
                                                        <>
                                                            <button onClick={() => { setConfirmAction({ type: 'reset', id: u.id }); setNewPasswordValue(''); }} style={actionBtnStyle('var(--text-main)', 'var(--background)', 'var(--text-muted)')}>
                                                                <KeyRound size={16} /> Reset
                                                            </button>
                                                            <button onClick={() => setConfirmAction({ type: 'delete', id: u.id })} style={actionBtnStyle('#EF4444', '#FEE2E2', '#DC2626')}>
                                                                <UserX size={16} /> Delete
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'add' && (
                <div className="fade-in" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                    <h2>Add New User</h2>
                    <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px', marginTop: '1.5rem' }}>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Role</label>
                            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} required style={inputStyle}>
                                <option value="student">Student</option>
                                <option value="teacher">Teacher</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Username</label>
                            <input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Password</label>
                            <input type="password" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={inputStyle} />
                        </div>

                        {newUserRole === 'student' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Form Class</label>
                                <input type="text" placeholder="e.g., Year 8, Form 4A" value={newFormClass} onChange={(e) => setNewFormClass(e.target.value)} required style={inputStyle} />
                            </div>
                        )}

                        <button type="submit" style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, marginTop: '1rem' }}>
                            Add User
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'bulk' && (
                <div className="fade-in" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                    <h2>Bulk Create Students</h2>
                    <div style={{ backgroundColor: '#DBEAFE', color: '#1E3A8A', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                        <strong>Formatting Rules:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
                            <li>Paste a list of students, one per line.</li>
                            <li>Format must be: <code>Student Name, Form Class</code></li>
                            <li>A default password of <strong>"password"</strong> will be securely created for all of them.</li>
                        </ul>
                    </div>
                    <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <textarea
                            placeholder={`Example Format:\n\nJoe bloggs, AS-2\nTed Bundy, G1-2`}
                            value={bulkText} onChange={(e) => setBulkText(e.target.value)} required
                            style={{ ...inputStyle, minHeight: '300px', resize: 'vertical', fontFamily: 'monospace' }}
                        />
                        <button type="submit" disabled={importing} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, width: 'fit-content' }}>
                            {importing ? 'Creating...' : 'Start Bulk Create'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

const thStyle = { padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '1rem' };
const actionBtnStyle = (color, bgHover, activeColor) => ({
    display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'transparent',
    color: color, border: `1px solid ${color}`, padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)',
    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
});

const navTabStyle = {
    padding: '0.75rem 1.5rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    backgroundColor: 'var(--surface)',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s'
};

const activeNavTabStyle = {
    backgroundColor: 'var(--primary)',
    color: 'white'
};

const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    fontSize: '1rem'
};
