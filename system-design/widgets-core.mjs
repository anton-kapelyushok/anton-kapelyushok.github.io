import { formatNumber } from './core.mjs';

export function availabilityBudget(percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Availability must be between 0% and 100%.');
    const fraction = (100 - percent) / 100;
    return { day: fraction * 86400, month: fraction * 86400 * 30, year: fraction * 86400 * 365 };
}

export function formatDowntime(seconds) {
    if (seconds === 0) return '0s';
    if (seconds < 1) return `${formatNumber(seconds * 1000)} ms`;
    let remaining = Math.round(seconds);
    const parts = [];
    for (const [duration, label] of [[86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']]) {
        const count = Math.floor(remaining / duration);
        if (count) parts.push(`${count}${label}`);
        remaining %= duration;
    }
    return parts.join(' ');
}

export const REQUIREMENTS = [
    { name: 'Functional Reqs', items: [
        ['actors', 'Identify the users', 'Who uses the system, and what are they trying to do?'],
        ['flows', 'Pick the core flows', 'Walk through the two or three most important operations.'],
        ['scope', 'Agree on scope', 'Say what is included and what can wait.'],
    ] },
    { name: 'Capacity', items: [
        ['traffic', 'Estimate traffic and peaks', 'Active users, operations per user, and burstiness.'],
        ['data', 'Size the data', 'Payload size, retention, and growth over time.'],
        ['access', 'Describe access patterns', 'Read/write mix, popular keys, and geographic distribution.'],
    ] },
    { name: 'Latency', items: [
        ['latency', 'Choose latency targets', 'Name the operation and percentile: for example, p95 reads.'],
        ['path', 'Trace the critical path', 'Network hops, sequential calls, and parallel work.'],
        ['async', 'Move deferrable work off the path', 'What needs an immediate answer, and what can be asynchronous?'],
    ] },
    { name: 'Availability', items: [
        ['uptime', 'Set the availability goal', 'Define successful requests and an acceptable error budget.'],
        ['consistency', 'Choose consistency guarantees', 'Where are stale reads acceptable? What must be atomic?'],
        ['recovery', 'Set recovery goals', 'Maximum recovery time (RTO) and acceptable data loss (RPO).'],
    ] },
    { name: 'High level design', items: [
        ['contracts', 'Sketch APIs and the data model', 'Request shapes, identifiers, records, and important queries.'],
        ['components', 'Connect the main components', 'Trace one read and one write through the design.'],
        ['bottleneck', 'Explain the bottleneck and failure plan', 'Show a scaling path, a tradeoff, and what happens when a dependency fails.'],
    ] },
];
