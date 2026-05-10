import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardList, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export default function StudentExitTicket({ user }) {
    const { ticketId } = useParams();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const loadTicket = async () => {
            try {
                const res = await fetch(`/api/exit-tickets/${ticketId}`, {
                    headers: { 'x-user-id': user.id, 'x-user-role': user.role }
                });
                if (!res.ok) throw new Error('Exit ticket not found');
                const data = await res.json();
                setTicket(data);
                const initialAnswers = {};
                data.prompts.forEach(prompt => {
                    initialAnswers[prompt.id] = '';
                });
                setAnswers(initialAnswers);
            } catch (error) {
                toast.error(error.message);
                navigate('/student');
            } finally {
                setLoading(false);
            }
        };

        loadTicket();
    }, [navigate, ticketId, user.id, user.role]);

    const submitTicket = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch(`/api/exit-tickets/${ticketId}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ answers })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not submit exit ticket');
            setSubmitted(true);
            toast.success('Exit ticket submitted');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading exit ticket...</div>;
    }

    if (submitted) {
        return (
            <div className="fade-in" style={{ maxWidth: '620px', margin: '3rem auto', padding: '2rem', textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
                <CheckCircle2 size={64} color="#10B981" style={{ marginBottom: '1rem' }} />
                <h1 style={{ margin: '0 0 0.75rem 0' }}>Thanks, {user.username}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.5 }}>
                    Your exit ticket has been sent to your teacher.
                </p>
                <button onClick={() => navigate('/student')} style={{ marginTop: '1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.5rem', cursor: 'pointer', fontWeight: 800 }}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="fade-in" style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem' }}>
            <button onClick={() => navigate('/student')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '2rem', padding: 0, fontWeight: 700 }}>
                <ArrowLeft size={20} /> Back to Dashboard
            </button>

            <form onSubmit={submitTicket} style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '2rem', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <ClipboardList color="var(--primary)" />
                    <h1 style={{ margin: 0 }}>{ticket.title}</h1>
                </div>
                <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '2rem' }}>
                    {ticket.class_name} · Teacher: {ticket.teacher_name}
                </p>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {ticket.prompts.map((prompt, index) => (
                        <div key={prompt.id}>
                            <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                                {index + 1}. {prompt.prompt_text}
                            </label>
                            <textarea
                                value={answers[prompt.id] || ''}
                                onChange={e => setAnswers(prev => ({ ...prev, [prompt.id]: e.target.value }))}
                                rows={4}
                                required
                                placeholder="Type your answer..."
                                style={{ width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', resize: 'vertical', fontSize: '1rem', lineHeight: 1.5 }}
                            />
                        </div>
                    ))}
                </div>

                <button type="submit" disabled={submitting} style={{ marginTop: '2rem', width: '100%', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '1rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <Send size={20} /> {submitting ? 'Submitting...' : 'Submit Exit Ticket'}
                </button>
            </form>
        </div>
    );
}
