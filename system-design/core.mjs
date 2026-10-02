export const SECONDS_PER_DAY = 86400;
export const STAGES = Object.freeze([
    { name: 'Functional Reqs', hint: 'Who is it for? Define the core use cases and scope.', minutes: 5 },
    { name: 'Capacity', group: 'Non Functional Reqs', hint: 'Estimate traffic, bandwidth, and retained data.', minutes: 5 },
    { name: 'Latency', group: 'Non Functional Reqs', hint: 'Set response-time targets. Consider p50, p95, and p99.', minutes: 3 },
    { name: 'Availability', group: 'Non Functional Reqs', hint: 'Set uptime goals and discuss consistency and failure tolerance.', minutes: 2 },
    { name: 'High level design', hint: 'Connect APIs, data stores, and services. Explain the tradeoffs.', minutes: 30 },
]);

export function formatNumber(value) {
    const magnitude = Math.abs(value);
    if (magnitude > 0 && magnitude < 0.01) {
        const [mantissa, exponent] = value.toExponential(2).split('e');
        return `${Number(mantissa)}e${exponent}`;
    }
    const digits = magnitude >= 10000 ? 0 : magnitude >= 1000 ? 1 : 2;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value === 0 ? 0 : value);
}

export function formatQuantity(value, unit = '', base = 1000) {
    const prefixes = unit ? ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'] : ['', 'K', 'M', 'B', 'T', 'P', 'E', 'Z', 'Y'];
    let index = 0;
    while (Math.abs(value) >= base && index < prefixes.length - 1) {
        value /= base;
        index++;
    }
    const prefix = unit === 'B' && index === 1 ? 'K' : prefixes[index];
    return `${formatNumber(value)}${prefix || unit ? ' ' : ''}${prefix}${unit}`;
}

export function formatTime(milliseconds) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createRun(budgets = STAGES.map(stage => stage.minutes)) {
    return { budgets: [...budgets], status: 'idle', elapsed: 0, startedAt: null, splits: [] };
}

export function elapsedTime(run, now) {
    return run.elapsed + (run.status === 'running' ? Math.max(0, now - run.startedAt) : 0);
}

export function startRun(run, now) {
    if (run.status !== 'idle' && run.status !== 'paused') return run;
    return { ...run, status: 'running', startedAt: now };
}

export function pauseRun(run, now) {
    if (run.status !== 'running') return run;
    return { ...run, status: 'paused', elapsed: elapsedTime(run, now), startedAt: null };
}

export function splitRun(run, now) {
    if (run.status !== 'running') return run;
    const elapsed = elapsedTime(run, now);
    const splits = [...run.splits, elapsed];
    const complete = splits.length === run.budgets.length;
    return { ...run, splits, elapsed, startedAt: complete ? null : now, status: complete ? 'complete' : 'running' };
}

export function validRun(run) {
    if (!run || !Array.isArray(run.budgets) || run.budgets.length !== STAGES.length ||
        !run.budgets.every(minutes => Number.isInteger(minutes) && minutes >= 1 && minutes <= 120) ||
        !['idle', 'running', 'paused', 'complete'].includes(run.status) ||
        !Number.isFinite(run.elapsed) || run.elapsed < 0 ||
        !Array.isArray(run.splits) || run.splits.length > STAGES.length) return false;
    if (!run.splits.every((split, i) => Number.isFinite(split) && split >= 0 &&
        split <= run.elapsed && (i === 0 || split >= run.splits[i - 1]))) return false;
    if (run.status === 'idle') return run.elapsed === 0 && run.splits.length === 0 && run.startedAt === null;
    if (run.status === 'complete') return run.splits.length === STAGES.length && run.startedAt === null && run.splits.at(-1) === run.elapsed;
    if (run.splits.length === STAGES.length) return false;
    return run.status === 'running' ? Number.isFinite(run.startedAt) && run.startedAt >= 0 : run.startedAt === null;
}
