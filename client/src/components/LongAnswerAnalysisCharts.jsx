import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Legend,
    LinearScale,
    Title,
    Tooltip
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

function getQuestionLabel(question, index) {
    const reference = String(question.shortName || '').match(/\bQ\d+(?:\([a-z0-9]+\)|[a-z])?/i)?.[0];
    return `${index + 1}. ${reference || `Q${index + 1}`}`;
}

function getBarColor(value) {
    if (value === null) return '#CBD5E1';
    if (value >= 70) return '#10B981';
    if (value >= 50) return '#F59E0B';
    return '#EF4444';
}

export default function LongAnswerAnalysisCharts({ analysis }) {
    const performance = analysis?.questionPerformance || [];
    if (!performance.length) return null;

    const chartData = {
        labels: performance.map(getQuestionLabel),
        datasets: [
            {
                label: 'Class Average',
                data: performance.map(question => question.averagePercent),
                backgroundColor: performance.map(question => getBarColor(question.averagePercent)),
                borderRadius: 6,
                maxBarThickness: 46
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    font: { family: "'Inter', sans-serif", size: 13 }
                }
            },
            tooltip: {
                callbacks: {
                    title: items => {
                        const question = performance[items[0]?.dataIndex];
                        return question?.shortName || items[0]?.label || '';
                    },
                    label: context => {
                        const question = performance[context.dataIndex];
                        if (context.parsed.y === null) return 'No responses yet';
                        return `Class average: ${context.parsed.y}% (${question.averageScore} / ${question.maxMarks})`;
                    },
                    afterLabel: context => `${performance[context.dataIndex]?.responseCount || 0} responses`
                }
            }
        },
        scales: {
            y: {
                min: 0,
                max: 100,
                ticks: {
                    callback: value => `${value}%`
                },
                title: {
                    display: true,
                    text: 'Average Score (%)'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Quiz Question'
                }
            }
        }
    };

    return (
        <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
                <div style={statStyle}>
                    <span style={statLabelStyle}>Overall Average</span>
                    <strong style={statValueStyle}>{analysis.overallAveragePercent ?? '-'}%</strong>
                </div>
                <div style={statStyle}>
                    <span style={statLabelStyle}>Questions</span>
                    <strong style={statValueStyle}>{analysis.questionCount}</strong>
                </div>
                <div style={statStyle}>
                    <span style={statLabelStyle}>Responses Marked</span>
                    <strong style={statValueStyle}>{analysis.responseCount}</strong>
                </div>
            </div>
            <div style={{ height: '310px', padding: '0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white', border: '1px solid #EDE9FE' }}>
                <Bar data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

const statStyle = {
    display: 'grid',
    gap: '0.2rem',
    padding: '0.75rem',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'white',
    border: '1px solid #EDE9FE'
};

const statLabelStyle = {
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
};

const statValueStyle = {
    color: '#4C1D95',
    fontSize: '1.4rem'
};
