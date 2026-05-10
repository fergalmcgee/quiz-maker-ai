import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, CheckCircle2, ClipboardList, Edit, Eye, Plus, RotateCcw, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';

const defaultPrompts = [
    'What is one thing you understood well today?',
    'What is one thing you are still unsure about?',
    'How confident do you feel? Explain briefly.'
];

function emptyForm() {
    return {
        id: null,
        title: '',
        classId: '',
        status: 'open',
        prompts: defaultPrompts.map((text, index) => ({
            localId: `new-${index}-${Date.now()}`,
            prompt_text: text,
            is_archived: 0
        }))
    };
}

export default function TeacherExitTickets({ user }) {
    const navigate = useNavigate();
    const [tickets, setTickets] = useState([]);
    const [classes, setClasses] = useState([]);
    const [form, setForm] = useState(emptyForm());
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [responsesData, setResponsesData] = useState(null);
    const [loadingResponses, setLoadingResponses] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    const fetchTickets = async () => {
        const res = await fetch(`/api/exit-tickets/teacher${showArchived ? '?includeArchived=true' : ''}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (res.ok) {
            setTickets(await res.json());
        }
    };

    const fetchClasses = async () => {
        const res = await fetch(`/api/classes?teacherId=${user.id}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (res.ok) {
            setClasses(await res.json());
        }
    };

    useEffect(() => {
        fetchTickets();
        fetchClasses();
    }, [showArchived]);

    const resetForm = () => {
        setForm(emptyForm());
    };

    const editTicket = async (ticketId) => {
        const res = await fetch(`/api/exit-tickets/${ticketId}`, {
            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
        });
        if (!res.ok) {
            toast.error('Could not load exit ticket');
            return;
        }
        const ticket = await res.json();
        setForm({
            id: ticket.id,
            title: ticket.title,
            classId: ticket.class_id,
            status: ticket.status,
            prompts: ticket.prompts.map(prompt => ({ ...prompt, localId: `prompt-${prompt.id}` }))
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveTicket = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                title: form.title,
                classId: form.classId,
                status: form.status,
                prompts: form.prompts
            };
            const res = await fetch(form.id ? `/api/exit-tickets/${form.id}` : '/api/exit-tickets', {
                method: form.id ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save exit ticket');

            toast.success(form.id ? 'Exit ticket updated' : 'Exit ticket created');
            resetForm();
            fetchTickets();
            if (selectedTicketId) fetchResponses(selectedTicketId);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const fetchResponses = async (ticketId) => {
        setSelectedTicketId(ticketId);
        setLoadingResponses(true);
        try {
            const res = await fetch(`/api/exit-tickets/${ticketId}/responses`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (!res.ok) throw new Error('Could not load responses');
            setResponsesData(await res.json());
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoadingResponses(false);
        }
    };

    const toggleReviewed = async (response) => {
        if (!responsesData) return;
        await fetch(`/api/exit-tickets/${responsesData.ticket.id}/responses/${response.id}/reviewed`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ reviewed: response.reviewed !== 1 })
        });
        fetchResponses(responsesData.ticket.id);
    };

    const toggleArchive = async (ticket) => {
        const isArchived = ticket.status === 'archived';
        if (!isArchived && !window.confirm(`Archive "${ticket.title}"? Responses will be kept, but students will no longer see it.`)) {
            return;
        }

        const res = await fetch(`/api/exit-tickets/${ticket.id}/archive`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ archived: !isArchived })
        });

        if (res.ok) {
            toast.success(isArchived ? 'Exit ticket restored' : 'Exit ticket archived');
            if (selectedTicketId === ticket.id && !isArchived) {
                setResponsesData(null);
                setSelectedTicketId(null);
            }
            fetchTickets();
        } else {
            const data = await res.json();
            toast.error(data.error || 'Could not update archive status');
        }
    };

    const updatePrompt = (index, patch) => {
        setForm(prev => ({
            ...prev,
            prompts: prev.prompts.map((prompt, promptIndex) => (
                promptIndex === index ? { ...prompt, ...patch } : prompt
            ))
        }));
    };

    const addPrompt = () => {
        setForm(prev => ({
            ...prev,
            prompts: [
                ...prev.prompts,
                { localId: `new-${Date.now()}`, prompt_text: '', is_archived: 0 }
            ]
        }));
    };

    const archivePrompt = (index) => {
        setForm(prev => ({
            ...prev,
            prompts: prev.prompts.map((prompt, promptIndex) => (
                promptIndex === index
                    ? { ...prompt, is_archived: prompt.id ? 1 : !prompt.is_archived }
                    : prompt
            ))
        }));
    };

    return (
        <div className="fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
            <button onClick={() => navigate('/teacher')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '2rem', padding: 0, fontWeight: 700 }}>
                <ArrowLeft size={20} /> Back to Teacher Dashboard
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '2rem', alignItems: 'start' }}>
                <form onSubmit={saveTicket} style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: '1.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <ClipboardList color="var(--primary)" />
                        <h2 style={{ margin: 0 }}>{form.id ? 'Edit Exit Ticket' : 'Create Exit Ticket'}</h2>
                    </div>

                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Title</label>
                    <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. End of lesson check-in" required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }} />

                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Class</label>
                    <select value={form.classId} onChange={e => setForm(prev => ({ ...prev, classId: e.target.value }))} required style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <option value="">Choose a class...</option>
                        {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                    </select>

                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Status</label>
                    <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                        <option value="open">Open to students</option>
                        <option value="draft">Draft</option>
                        <option value="closed">Closed</option>
                    </select>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <label style={{ fontWeight: 700 }}>Prompts</label>
                        <button type="button" onClick={addPrompt} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#EEF2FF', color: '#3730A3', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}>
                            <Plus size={16} /> Add
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                        {form.prompts.map((prompt, index) => (
                            <div key={prompt.localId || prompt.id} style={{ display: prompt.is_archived ? 'none' : 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem' }}>
                                <textarea value={prompt.prompt_text} onChange={e => updatePrompt(index, { prompt_text: e.target.value })} placeholder={`Prompt ${index + 1}`} rows={2} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', resize: 'vertical' }} />
                                <button type="button" onClick={() => archivePrompt(index)} title="Archive prompt" style={{ alignSelf: 'start', backgroundColor: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.65rem', cursor: 'pointer' }}>
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                        Prompt edits are safe: existing student answers stay connected to the original prompt. Removing a prompt archives it instead of deleting past responses.
                    </p>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                        <button type="submit" disabled={saving} style={{ flex: 1, backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <Save size={18} /> {saving ? 'Saving...' : 'Save'}
                        </button>
                        {form.id && (
                            <button type="button" onClick={resetForm} style={{ backgroundColor: '#E5E7EB', color: 'var(--text-main)', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.85rem', cursor: 'pointer', fontWeight: 700 }}>
                                New
                            </button>
                        )}
                    </div>
                </form>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    <section style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>{showArchived ? 'All Exit Tickets' : 'Active Exit Tickets'}</h2>
                            <button
                                onClick={() => setShowArchived(prev => !prev)}
                                style={{ backgroundColor: showArchived ? '#EEF2FF' : 'white', color: '#3730A3', border: '1px solid #C7D2FE', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {showArchived ? <ClipboardList size={16} /> : <Archive size={16} />}
                                {showArchived ? 'Hide Archived' : 'Show Archived'}
                            </button>
                        </div>
                        {tickets.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>{showArchived ? 'No exit tickets found.' : 'No active exit tickets yet. Create one to collect quick student reflections.'}</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {tickets.map(ticket => (
                                    <div key={ticket.id} style={{ border: `1px solid ${ticket.status === 'archived' ? '#CBD5E1' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', backgroundColor: ticket.status === 'archived' ? '#F8FAFC' : 'white', opacity: ticket.status === 'archived' ? 0.78 : 1 }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 0.35rem 0' }}>{ticket.title}</h3>
                                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{ticket.class_name} · {ticket.prompt_count} prompts · {ticket.response_count} responses · {ticket.status}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => editTicket(ticket.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: '1px solid var(--border)', backgroundColor: 'white', padding: '0.55rem 0.8rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 700 }}>
                                                <Edit size={16} /> Edit
                                            </button>
                                            <button onClick={() => fetchResponses(ticket.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: 'none', backgroundColor: 'var(--secondary)', color: 'white', padding: '0.55rem 0.8rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 700 }}>
                                                <Eye size={16} /> Responses
                                            </button>
                                            <button onClick={() => toggleArchive(ticket)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: 'none', backgroundColor: ticket.status === 'archived' ? '#DCFCE7' : '#F1F5F9', color: ticket.status === 'archived' ? '#166534' : '#475569', padding: '0.55rem 0.8rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 700 }}>
                                                {ticket.status === 'archived' ? <RotateCcw size={16} /> : <Archive size={16} />}
                                                {ticket.status === 'archived' ? 'Restore' : 'Archive'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                        <h2 style={{ marginTop: 0 }}>Response Cards</h2>
                        {loadingResponses ? (
                            <p>Loading responses...</p>
                        ) : !responsesData ? (
                            <p style={{ color: 'var(--text-muted)' }}>Choose an exit ticket to view student responses as cards.</p>
                        ) : responsesData.responses.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No student responses yet for “{responsesData.ticket.title}”.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                                {responsesData.responses.map(response => (
                                    <div key={response.id} style={{ backgroundColor: 'white', border: `1px solid ${response.reviewed ? '#A7F3D0' : '#E2E8F0'}`, borderTop: `5px solid ${response.reviewed ? '#10B981' : '#4F46E5'}`, borderRadius: 'var(--radius-md)', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0 }}>{response.username}</h3>
                                                <p style={{ margin: '0.15rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{response.form_class || responsesData.ticket.class_name}</p>
                                            </div>
                                            <button onClick={() => toggleReviewed(response)} style={{ backgroundColor: response.reviewed ? '#ECFDF5' : '#F1F5F9', color: response.reviewed ? '#047857' : '#475569', border: 'none', borderRadius: 'var(--radius-full)', padding: '0.35rem 0.6rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <CheckCircle2 size={14} /> {response.reviewed ? 'Reviewed' : 'Mark'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.85rem' }}>
                                            {response.answers.map(answer => (
                                                <div key={answer.id}>
                                                    <div style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>{answer.prompt_text}</div>
                                                    <div style={{ color: 'var(--text-main)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{answer.answer_text || 'No answer'}</div>
                                                </div>
                                            ))}
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
