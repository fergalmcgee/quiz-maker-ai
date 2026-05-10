import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, Eye, Lightbulb, Monitor, Play, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

function emptyForm() {
    return {
        classId: '',
        templateId: '',
        mode: 'traffic_light',
        title: '',
        question: '',
        saveAsTemplate: true
    };
}

export default function TeacherQuickChecks({ user }) {
    const navigate = useNavigate();
    const [classes, setClasses] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [checks, setChecks] = useState([]);
    const [form, setForm] = useState(emptyForm());
    const [showArchived, setShowArchived] = useState(false);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [launching, setLaunching] = useState(false);

    const fetchClasses = async () => {
        const res = await fetch(`/api/classes?teacherId=${user.id}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (res.ok) setClasses(await res.json());
    };

    const fetchTemplates = async () => {
        const res = await fetch(`/api/quick-check-templates${showArchived ? '?includeArchived=true' : ''}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (res.ok) setTemplates(await res.json());
    };

    const fetchChecks = async () => {
        const res = await fetch(`/api/quick-checks/teacher${showArchived ? '?includeArchived=true' : ''}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (res.ok) setChecks(await res.json());
    };

    useEffect(() => {
        fetchClasses();
    }, []);

    useEffect(() => {
        fetchTemplates();
        fetchChecks();
    }, [showArchived]);

    const useTemplate = (template) => {
        setForm(prev => ({
            ...prev,
            templateId: template.id,
            mode: template.mode,
            title: template.title,
            question: template.question,
            saveAsTemplate: false
        }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveTemplate = async () => {
        setSavingTemplate(true);
        try {
            const res = await fetch(form.templateId ? `/api/quick-check-templates/${form.templateId}` : '/api/quick-check-templates', {
                method: form.templateId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({
                    mode: form.mode,
                    title: form.title,
                    question: form.question
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save template');
            toast.success('Template saved');
            setForm(prev => ({ ...prev, templateId: data.template.id, saveAsTemplate: false }));
            fetchTemplates();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSavingTemplate(false);
        }
    };

    const launchCheck = async (e) => {
        e.preventDefault();
        setLaunching(true);
        try {
            const launchPayload = {
                ...form,
                title: form.title.trim() || (form.mode === 'traffic_light' ? 'Traffic Light Check' : ''),
                question: form.question.trim() || (form.mode === 'traffic_light' ? 'How are you feeling about this?' : ''),
                saveAsTemplate: form.mode === 'traffic_light' && !form.question.trim()
                    ? false
                    : form.saveAsTemplate
            };
            const res = await fetch('/api/quick-checks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify(launchPayload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not launch quick check');
            toast.success('Quick check launched');
            setForm(emptyForm());
            fetchTemplates();
            fetchChecks();
            navigate(`/teacher/quick-checks/${data.check.id}/display`);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLaunching(false);
        }
    };

    const updateCheckStatus = async (check, status) => {
        if (status === 'archived' && !window.confirm(`Archive "${check.title}"? Responses will be kept.`)) return;
        const res = await fetch(`/api/quick-checks/${check.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast.success(status === 'archived' ? 'Quick check archived' : 'Quick check updated');
            fetchChecks();
        }
    };

    const deleteCheckPermanently = async (check) => {
        const confirmed = window.confirm(`Permanently delete "${check.title}" and all ${check.response_count || 0} response(s)? This cannot be undone.`);
        if (!confirmed) return;

        const secondConfirmed = window.confirm('Final check: this will permanently remove the quick check and its responses from the database. Continue?');
        if (!secondConfirmed) return;

        const res = await fetch(`/api/quick-checks/${check.id}`, {
            method: 'DELETE',
            headers: {
                'x-user-id': user.id,
                'x-user-role': user.role
            }
        });

        if (res.ok) {
            toast.success('Quick check permanently deleted');
            fetchChecks();
        } else {
            const data = await res.json();
            toast.error(data.error || 'Could not delete quick check');
        }
    };

    const toggleTemplateArchive = async (template) => {
        const res = await fetch(`/api/quick-check-templates/${template.id}/archive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ archived: template.is_archived !== 1 })
        });
        if (res.ok) {
            toast.success(template.is_archived === 1 ? 'Template restored' : 'Template archived');
            fetchTemplates();
        }
    };

    return (
        <div className="fade-in" style={{ maxWidth: '1150px', margin: '0 auto', padding: '2rem' }}>
            <button onClick={() => navigate('/teacher')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '2rem', padding: 0, fontWeight: 700 }}>
                <ArrowLeft size={20} /> Back to Teacher Dashboard
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 430px) 1fr', gap: '2rem', alignItems: 'start' }}>
                <form onSubmit={launchCheck} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <Lightbulb color="var(--primary)" />
                        <h2 style={{ margin: 0 }}>Launch Quick Check</h2>
                    </div>

                    <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Mode</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        {[
                            ['traffic_light', 'Traffic Light'],
                            ['whiteboard', 'Mini Whiteboard']
                        ].map(([mode, label]) => (
                            <button key={mode} type="button" onClick={() => setForm(prev => ({ ...prev, mode }))} style={{ padding: '0.8rem', borderRadius: 'var(--radius-md)', border: `2px solid ${form.mode === mode ? 'var(--primary)' : 'var(--border)'}`, backgroundColor: form.mode === mode ? '#EEF2FF' : 'white', color: form.mode === mode ? '#3730A3' : 'var(--text-main)', cursor: 'pointer', fontWeight: 800 }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Class</label>
                    <select value={form.classId} onChange={e => setForm(prev => ({ ...prev, classId: e.target.value }))} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <option value="">Choose a class...</option>
                        {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                    </select>

                    <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Title</label>
                    <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} required={form.mode === 'whiteboard'} placeholder={form.mode === 'traffic_light' ? 'Optional: Traffic Light Check' : 'e.g. Show your working'} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }} />

                    <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Question</label>
                    <textarea value={form.question} onChange={e => setForm(prev => ({ ...prev, question: e.target.value }))} required={form.mode === 'whiteboard'} rows={4} placeholder={form.mode === 'traffic_light' ? 'Optional: leave blank for a quick red/yellow/green check' : 'Show your method for question 4.'} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', resize: 'vertical', marginBottom: '0.5rem' }} />
                    {form.mode === 'traffic_light' && (
                        <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.45 }}>
                            Traffic lights can be launched without a typed question for an instant understanding check.
                        </p>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '1rem' }}>
                        <input type="checkbox" checked={form.saveAsTemplate} onChange={e => setForm(prev => ({ ...prev, saveAsTemplate: e.target.checked }))} />
                        Save as reusable question
                    </label>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="submit" disabled={launching} style={{ flex: 1, backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.9rem', cursor: launching ? 'not-allowed' : 'pointer', fontWeight: 900, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                            <Send size={18} /> {launching ? 'Launching...' : 'Launch'}
                        </button>
                        <button type="button" onClick={saveTemplate} disabled={savingTemplate} style={{ backgroundColor: '#EEF2FF', color: '#3730A3', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.9rem', cursor: savingTemplate ? 'not-allowed' : 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Save size={18} /> Template
                        </button>
                    </div>
                </form>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    <section style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>Reusable Questions</h2>
                            <button onClick={() => setShowArchived(prev => !prev)} style={{ border: '1px solid #C7D2FE', backgroundColor: showArchived ? '#EEF2FF' : 'white', color: '#3730A3', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 800 }}>
                                {showArchived ? 'Hide Archived' : 'Show Archived'}
                            </button>
                        </div>
                        {templates.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No reusable quick questions yet.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {templates.map(template => (
                                    <div key={template.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', opacity: template.is_archived ? 0.65 : 1, backgroundColor: template.is_archived ? '#F8FAFC' : 'white' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                            <div>
                                                <h3 style={{ margin: '0 0 0.35rem 0' }}>{template.title}</h3>
                                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{template.mode === 'traffic_light' ? 'Traffic Light' : 'Mini Whiteboard'} · {template.question}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'start' }}>
                                                <button onClick={() => useTemplate(template)} style={{ border: 'none', backgroundColor: 'var(--secondary)', color: 'white', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 800 }}>
                                                    Use
                                                </button>
                                                <button onClick={() => toggleTemplateArchive(template)} style={{ border: 'none', backgroundColor: template.is_archived ? '#DCFCE7' : '#F1F5F9', color: template.is_archived ? '#166534' : '#475569', borderRadius: 'var(--radius-md)', padding: '0.55rem', cursor: 'pointer' }}>
                                                    {template.is_archived ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.5rem' }}>
                        <h2 style={{ marginTop: 0 }}>Recent Quick Checks</h2>
                        {checks.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>Launch a quick check to see it here.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.85rem' }}>
                                {checks.map(check => (
                                    <div key={check.id} style={{ backgroundColor: check.status === 'archived' ? '#F1F5F9' : 'white', border: '1px solid #E2E8F0', borderLeft: `5px solid ${check.mode === 'traffic_light' ? '#F59E0B' : '#4F46E5'}`, borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', opacity: check.status === 'archived' ? 0.7 : 1 }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 0.25rem 0' }}>{check.title}</h3>
                                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{check.class_name} · {check.response_count} responses · {check.status}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => navigate(`/teacher/quick-checks/${check.id}/display`)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: 'none', backgroundColor: '#111827', color: 'white', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 800 }}>
                                                <Monitor size={16} /> Display
                                            </button>
                                            {check.status === 'open' && (
                                                <button onClick={() => updateCheckStatus(check, 'closed')} style={{ border: '1px solid var(--border)', backgroundColor: 'white', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 800 }}>
                                                    End
                                                </button>
                                            )}
                                            {check.status !== 'archived' ? (
                                                <button onClick={() => updateCheckStatus(check, 'archived')} style={{ border: 'none', backgroundColor: '#F1F5F9', color: '#475569', borderRadius: 'var(--radius-md)', padding: '0.55rem', cursor: 'pointer' }}>
                                                    <Archive size={16} />
                                                </button>
                                            ) : (
                                                <button onClick={() => updateCheckStatus(check, 'closed')} style={{ border: 'none', backgroundColor: '#DCFCE7', color: '#166534', borderRadius: 'var(--radius-md)', padding: '0.55rem', cursor: 'pointer' }}>
                                                    <RotateCcw size={16} />
                                                </button>
                                            )}
                                            <button onClick={() => deleteCheckPermanently(check)} title="Permanently delete" style={{ border: 'none', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: 'var(--radius-md)', padding: '0.55rem', cursor: 'pointer' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
