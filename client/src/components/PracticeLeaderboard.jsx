import React, { useState, useEffect } from 'react';
import { Trophy, Users, Globe, Award } from 'lucide-react';

export default function PracticeLeaderboard({ quizId, user, classId }) {
    const [leaderboard, setLeaderboard] = useState([]);
    const [scope, setScope] = useState(classId ? 'class' : 'global');
    const [timeframe, setTimeframe] = useState('all'); // 'all', 'week', 'month'
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
    }, [quizId, scope, classId, timeframe]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            let url = `/api/quizzes/${quizId}/leaderboard?scope=${scope}&timeframe=${timeframe}`;
            if (scope === 'class' && classId) {
                url += `&classId=${classId}`;
            }
            const res = await fetch(url, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setLeaderboard(data);
            }
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', backgroundColor: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Trophy size={20} color="#EAB308" />
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Practice Leaderboard</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: '#F1F5F9', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                        {classId && (
                            <button 
                                onClick={() => setScope('class')}
                                style={{ 
                                    padding: '0.3rem 0.75rem', fontSize: '0.8rem', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                    backgroundColor: scope === 'class' ? 'white' : 'transparent',
                                    color: scope === 'class' ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: 600, boxShadow: scope === 'class' ? 'var(--shadow-sm)' : 'none'
                                }}
                            >
                                Class
                            </button>
                        )}
                        <button 
                            onClick={() => setScope('global')}
                            style={{ 
                                padding: '0.3rem 0.75rem', fontSize: '0.8rem', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                backgroundColor: scope === 'global' ? 'white' : 'transparent',
                                color: scope === 'global' ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: 600, boxShadow: scope === 'global' ? 'var(--shadow-sm)' : 'none'
                            }}
                        >
                            Global
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: 'none' }}>
                    {['all', 'week', 'month'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            style={{
                                flex: 1,
                                padding: '0.4rem',
                                fontSize: '0.75rem',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                backgroundColor: timeframe === t ? '#EEF2FF' : 'transparent',
                                color: timeframe === t ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: timeframe === t ? 700 : 500,
                                transition: 'all 0.2s'
                            }}
                        >
                            {t === 'all' ? 'All Time' : t === 'week' ? 'This Week' : 'This Month'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '1rem' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Loading leaderboard...</p>
                ) : leaderboard.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No scores this period. Be the first!</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {leaderboard.map((entry, index) => {
                            const isMe = String(entry.user_id) === String(user.id);
                            return (
                                <div 
                                    key={entry.user_id} 
                                    style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', 
                                        backgroundColor: isMe ? '#EEF2FF' : 'white',
                                        borderRadius: 'var(--radius-md)',
                                        border: isMe ? '1px solid var(--primary-light)' : '1px solid transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ 
                                            width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: index === 0 ? '#FEF9C3' : index === 1 ? '#F1F5F9' : index === 2 ? '#FFEDD5' : '#F8FAFC',
                                            color: index === 0 ? '#854D0E' : index === 1 ? '#475569' : index === 2 ? '#9A3412' : 'var(--text-muted)',
                                            fontWeight: 800, fontSize: '0.85rem'
                                        }}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: isMe ? 'var(--primary)' : 'var(--text-main)' }}>
                                                {entry.username} {isMe && '(You)'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {new Date(entry.completed_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.1rem' }}>{entry.best_score}%</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{entry.points} pts</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
