import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, UserX, KeyRound, UserPlus, FileText, Tags, Shield, Database, Search, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDashboard({ user }) {
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmAction, setConfirmAction] = useState(null);
    const [newPasswordValue, setNewPasswordValue] = useState('');

    const [activeTab, setActiveTab] = useState('users'); // 'users', 'add', 'bulk', 'tags', 'questions', 'audit'

    // Add User State
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFormClass, setNewFormClass] = useState('');
    const [newUserRole, setNewUserRole] = useState('student');

    // Bulk Import State
    const [bulkText, setBulkText] = useState('');
    const [importing, setImporting] = useState(false);

    // Tags Management State
    const [tagData, setTagData] = useState({ subjects: [], levels: [], topics: [] });
    const [selectedTags, setSelectedTags] = useState({ subjects: [], levels: [], topics: [] });
    const [mergeTarget, setMergeTarget] = useState({ subjects: '', levels: '', topics: '' });

    // Question Bank Tag Reallocation State
    const [bankQuestions, setBankQuestions] = useState([]);
    const [bankQuestionDrafts, setBankQuestionDrafts] = useState({});
    const [bankSearch, setBankSearch] = useState('');
    const [bankFilters, setBankFilters] = useState({ subject: '', level: '', topic: '' });
    const [bankLoading, setBankLoading] = useState(false);
    const [bankError, setBankError] = useState('');

    useEffect(() => {
        fetchUsers();
        fetchTags();
    }, []);

    useEffect(() => {
        if (activeTab === 'audit' && auditLogs.length === 0 && !auditLoading) {
            fetchAuditLogs();
        }
    }, [activeTab, auditLogs.length, auditLoading]);

    useEffect(() => {
        if (activeTab === 'questions' && bankQuestions.length === 0 && !bankLoading) {
            fetchBankQuestions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/users', {
                headers: { 
                    'x-user-role': user.role,
                    'x-user-id': user.id
                }
            });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchTags = async () => {
        try {
            const res = await fetch('/api/admin/tags', {
                headers: { 'x-user-role': user.role, 'x-user-id': user.id }
            });
            if (res.ok) {
                const data = await res.json();
                setTagData(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            setAuditLoading(true);
            setAuditError('');
            const res = await fetch('/api/admin/audit-logs?limit=100', {
                headers: {
                    'x-user-role': user.role,
                    'x-user-id': user.id
                }
            });
            if (!res.ok) throw new Error('Failed to fetch audit logs');
            const data = await res.json();
            setAuditLogs(data.logs || []);
        } catch (err) {
            setAuditError(err.message);
        } finally {
            setAuditLoading(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            const res = await fetch(`/api/admin/users/${id}/approve`, {
                method: 'PUT',
                headers: { 
                    'x-user-role': user.role,
                    'x-user-id': user.id
                }
            });
            if (!res.ok) throw new Error('Failed to approve user');
            fetchUsers();
            toast.success('User approved.');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 
                    'x-user-role': user.role,
                    'x-user-id': user.id
                }
            });
            if (!res.ok) throw new Error('Failed to delete user');
            fetchUsers();
            setConfirmAction(null);
            toast.success('User deleted.');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleResetPassword = async (id) => {
        if (!newPasswordValue) return;

        try {
            const res = await fetch(`/api/admin/users/${id}/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': user.role,
                    'x-user-id': user.id
                },
                body: JSON.stringify({ newPassword: newPasswordValue })
            });
            if (!res.ok) throw new Error('Failed to reset password');
            setConfirmAction(null);
            setNewPasswordValue('');
            toast.success('Password reset successfully.');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-role': user.role,
                    'x-user-id': user.id
                },
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
                toast.success('User created.');
            } else {
                const errData = await res.json();
                toast.error(`Error: ${errData.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleBulkImport = async (e) => {
        e.preventDefault();
        setImporting(true);
        try {
            const res = await fetch('/api/students/import', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-role': user.role,
                    'x-user-id': user.id
                },
                body: JSON.stringify({ bulkText, createdBy: user.id })
            });
            if (res.ok) {
                const data = await res.json();
                setBulkText('');
                fetchUsers();
                toast.success(`Imported ${data.studentsImported} students!`);
                setActiveTab('users');
            } else {
                const errData = await res.json();
                toast.error(`Error: ${errData.error || 'Failed to import students'}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setImporting(false);
        }
    };

    const handleMergeTags = async (field) => {
        const oldValues = selectedTags[field + 's'];
        const newValue = mergeTarget[field + 's'].trim();
        
        if (oldValues.length === 0) return toast.error("Please select at least one tag to merge.");
        if (!newValue) return toast.error("Please enter a target name to merge into.");

        try {
            const res = await fetch('/api/admin/tags/merge', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-role': user.role,
                    'x-user-id': user.id
                },
                body: JSON.stringify({ field, oldValues, newValue })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(data.message);
                setSelectedTags({ ...selectedTags, [field + 's']: [] });
                setMergeTarget({ ...mergeTarget, [field + 's']: '' });
                fetchTags();
            } else {
                const errData = await res.json();
                toast.error(errData.error || "Failed to merge tags");
            }
        } catch (e) {
            console.error(e);
            toast.error("Network error");
        }
    };

    const toggleTagSelection = (field, tag) => {
        const current = selectedTags[field + 's'];
        if (current.includes(tag)) {
            setSelectedTags({ ...selectedTags, [field + 's']: current.filter(t => t !== tag) });
        } else {
            setSelectedTags({ ...selectedTags, [field + 's']: [...current, tag] });
        }
    };

    const fetchBankQuestions = async () => {
        try {
            setBankLoading(true);
            setBankError('');
            const params = new URLSearchParams();
            if (bankSearch.trim()) params.append('q', bankSearch.trim());
            if (bankFilters.subject) params.append('subject', bankFilters.subject);
            if (bankFilters.level) params.append('level', bankFilters.level);
            if (bankFilters.topic) params.append('topic', bankFilters.topic);

            const res = await fetch(`/api/bank/questions?${params.toString()}`, {
                headers: { 'x-user-role': user.role, 'x-user-id': user.id }
            });
            if (!res.ok) throw new Error('Failed to load question bank');

            const data = await res.json();
            setBankQuestions(Array.isArray(data) ? data : []);
            setBankQuestionDrafts(Object.fromEntries((Array.isArray(data) ? data : []).map(question => [
                question.id,
                {
                    subject: question.subject || 'General',
                    level: question.level || 'General',
                    topic: question.topic || 'General'
                }
            ])));
        } catch (err) {
            setBankError(err.message);
        } finally {
            setBankLoading(false);
        }
    };

    const updateBankQuestionDraft = (questionId, field, value) => {
        setBankQuestionDrafts(prev => ({
            ...prev,
            [questionId]: {
                ...(prev[questionId] || {}),
                [field]: value
            }
        }));
    };

    const handleSaveQuestionTags = async (question) => {
        const draft = bankQuestionDrafts[question.id] || {};
        try {
            const res = await fetch(`/api/admin/bank/questions/${question.id}/tags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': user.role,
                    'x-user-id': user.id
                },
                body: JSON.stringify({
                    subject: draft.subject,
                    level: draft.level,
                    topic: draft.topic
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to update question tags');
            }

            const data = await res.json();
            setBankQuestions(prev => prev.map(item => item.id === question.id ? { ...item, ...data.question } : item));
            fetchTags();
            toast.success('Question moved to the new tags.');
        } catch (err) {
            toast.error(err.message);
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
                <button onClick={() => setActiveTab('bulk')} style={{ ...navTabStyle, ...(activeTab === 'bulk' ? activeNavTabStyle : {}) }}>
                    <FileText size={18} /> Bulk Create Students
                </button>
                <button onClick={() => setActiveTab('tags')} style={{ ...navTabStyle, ...(activeTab === 'tags' ? activeNavTabStyle : {}) }}>
                    <Tags size={18} /> Tag Management
                </button>
                <button onClick={() => setActiveTab('questions')} style={{ ...navTabStyle, ...(activeTab === 'questions' ? activeNavTabStyle : {}) }}>
                    <Database size={18} /> Question Tags
                </button>
                <button onClick={() => setActiveTab('audit')} style={{ ...navTabStyle, ...(activeTab === 'audit' ? activeNavTabStyle : {}) }}>
                    <Shield size={18} /> Audit Log
                </button>
            </div>

            <datalist id="subject-tag-options">
                {(tagData.subjects || []).map(tag => <option key={tag} value={tag} />)}
            </datalist>
            <datalist id="level-tag-options">
                {(tagData.levels || []).map(tag => <option key={tag} value={tag} />)}
            </datalist>
            <datalist id="topic-tag-options">
                {(tagData.topics || []).map(tag => <option key={tag} value={tag} />)}
            </datalist>

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

            {activeTab === 'tags' && (
                <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {['subject', 'level', 'topic'].map(field => {
                        const list = tagData[field + 's'] || [];
                        const selected = selectedTags[field + 's'];
                        const target = mergeTarget[field + 's'];

                        return (
                            <div key={field} style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <h3 style={{ marginTop: 0, textTransform: 'capitalize', color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>{field}s ({list.length})</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Merge messy {field} names into a single clean tag.</p>
                                
                                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', marginBottom: '1rem', backgroundColor: '#F8FAFC' }}>
                                    {list.length === 0 ? (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No tags found.</div>
                                    ) : (
                                        list.map(tag => (
                                            <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #E2E8F0', fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selected.includes(tag)}
                                                    onChange={() => toggleTagSelection(field, tag)}
                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                                />
                                                {tag}
                                            </label>
                                        ))
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <input 
                                        type="text" 
                                        placeholder={`Target Canonical ${field.charAt(0).toUpperCase() + field.slice(1)} Name`} 
                                        value={target}
                                        onChange={e => setMergeTarget({ ...mergeTarget, [field + 's']: e.target.value })}
                                        style={inputStyle}
                                    />
                                    <button 
                                        onClick={() => handleMergeTags(field)}
                                        disabled={selected.length === 0 || !target}
                                        style={{ backgroundColor: selected.length === 0 || !target ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem', borderRadius: 'var(--radius-md)', cursor: selected.length === 0 || !target ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', marginTop: '0.5rem' }}
                                    >
                                        Merge {selected.length} Tags
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {activeTab === 'questions' && (
                <div className="fade-in" style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Database size={22} /> Question Bank Tags</h3>
                            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                                Search misplaced questions and reassign their subject, level, or topic.
                            </p>
                        </div>
                        <button
                            onClick={fetchBankQuestions}
                            disabled={bankLoading}
                            style={{ ...actionBtnStyle('var(--primary)', 'var(--background)', 'var(--primary)'), opacity: bankLoading ? 0.65 : 1, cursor: bankLoading ? 'not-allowed' : 'pointer' }}
                        >
                            <Search size={16} /> {bankLoading ? 'Searching...' : 'Refresh'}
                        </button>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            fetchBankQuestions();
                        }}
                        style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1.25rem' }}
                    >
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>Question Text</label>
                            <input
                                type="text"
                                value={bankSearch}
                                onChange={e => setBankSearch(e.target.value)}
                                placeholder="Search question wording"
                                style={inputStyle}
                            />
                        </div>
                        {['subject', 'level', 'topic'].map(field => (
                            <div key={field}>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>{field}</label>
                                <input
                                    list={`${field}-tag-options`}
                                    value={bankFilters[field]}
                                    onChange={e => setBankFilters({ ...bankFilters, [field]: e.target.value })}
                                    placeholder={`Any ${field}`}
                                    style={inputStyle}
                                />
                            </div>
                        ))}
                        <button
                            type="submit"
                            disabled={bankLoading}
                            style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', cursor: bankLoading ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                        >
                            <Search size={16} /> Search
                        </button>
                    </form>

                    {bankError && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                            {bankError}
                        </div>
                    )}

                    {bankLoading && bankQuestions.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading questions...</div>
                    ) : bankQuestions.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                            No questions found.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {bankQuestions.map(question => {
                                const draft = bankQuestionDrafts[question.id] || {
                                    subject: question.subject || 'General',
                                    level: question.level || 'General',
                                    topic: question.topic || 'General'
                                };
                                const hasChanges = draft.subject !== (question.subject || 'General') || draft.level !== (question.level || 'General') || draft.topic !== (question.topic || 'General');

                                return (
                                    <div key={question.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: '#F8FAFC' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>{question.text}</div>
                                                <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    From {question.quiz_title || 'Unknown quiz'}{question.author_name ? ` by ${question.author_name}` : ''} · ID {question.id}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleSaveQuestionTags(question)}
                                                disabled={!hasChanges}
                                                style={{ backgroundColor: hasChanges ? 'var(--primary)' : '#9CA3AF', color: 'white', border: 'none', padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', cursor: hasChanges ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
                                            >
                                                <Save size={16} /> Save
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: '0.75rem' }}>
                                            {['subject', 'level', 'topic'].map(field => (
                                                <div key={field}>
                                                    <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{field}</label>
                                                    <input
                                                        list={`${field}-tag-options`}
                                                        value={draft[field]}
                                                        onChange={e => updateBankQuestionDraft(question.id, field, e.target.value)}
                                                        style={{ ...inputStyle, backgroundColor: 'white' }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'audit' && (
                <div className="fade-in" style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Recent Audit Log</h3>
                            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                                Latest admin and teacher actions recorded by the server.
                            </p>
                        </div>
                        <button
                            onClick={fetchAuditLogs}
                            disabled={auditLoading}
                            style={{
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                cursor: auditLoading ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                opacity: auditLoading ? 0.7 : 1
                            }}
                        >
                            {auditLoading ? 'Refreshing...' : 'Refresh Log'}
                        </button>
                    </div>

                    {auditError && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                            {auditError}
                        </div>
                    )}

                    {auditLoading && auditLogs.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading audit log...</div>
                    ) : auditLogs.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No audit events recorded yet.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={thStyle}>Time</th>
                                        <th style={thStyle}>Actor</th>
                                        <th style={thStyle}>Action</th>
                                        <th style={thStyle}>Target</th>
                                        <th style={thStyle}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((log) => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                                            <td style={{ ...tdStyle, minWidth: '150px', whiteSpace: 'nowrap' }}>
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                            <td style={{ ...tdStyle, minWidth: '150px' }}>
                                                <div style={{ fontWeight: 600 }}>
                                                    {log.actor_username || `User ${log.actor_id ?? 'Unknown'}`}
                                                </div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    {log.actor_role}
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, minWidth: '150px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.35rem 0.6rem',
                                                    borderRadius: '999px',
                                                    backgroundColor: '#E0F2FE',
                                                    color: '#0C4A6E',
                                                    fontSize: '0.82rem',
                                                    fontWeight: 700
                                                }}>
                                                    {formatAuditAction(log.action)}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, minWidth: '130px' }}>
                                                <div style={{ fontWeight: 600 }}>{log.target_type}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    ID: {log.target_id ?? '-'}
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, minWidth: '260px' }}>
                                                <pre style={{
                                                    margin: 0,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    fontSize: '0.82rem',
                                                    lineHeight: 1.5,
                                                    backgroundColor: '#F8FAFC',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    padding: '0.75rem'
                                                }}>
                                                    {formatAuditDetails(log.details)}
                                                </pre>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatAuditAction(action) {
    return String(action || '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatAuditDetails(details) {
    if (!details || (typeof details === 'object' && Object.keys(details).length === 0)) {
        return 'No extra details';
    }
    try {
        return JSON.stringify(details, null, 2);
    } catch {
        return String(details);
    }
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
