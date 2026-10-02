import {
    STAGES, formatTime,
    createRun, elapsedTime, startRun, pauseRun, splitRun, validRun,
} from './core.mjs';
import { evaluateExpression, formatExpression } from './expression.mjs';
import { initializeWidgets } from './widgets.js';

const $ = id => document.getElementById(id);
const widgets = initializeWidgets();
const storageKey = 'system-design-cheatsheet:v1';
let saved = {};
let storageAvailable = true;
try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (parsed && typeof parsed === 'object') saved = parsed;
} catch { /* A missing or corrupt save starts a fresh session. */ }

let expression = typeof saved.expression === 'string' && saved.expression.length <= 500
    ? saved.expression : '100000 / day * 1 month * 200 bytes';
let run = validRun(saved.run) ? saved.run : createRun();
const bests = {};
if (saved.bests && typeof saved.bests === 'object') {
    for (const [key, best] of Object.entries(saved.bests)) {
        if (validRun(best) && best.status === 'complete' && best.budgets.join('-') === key) bests[key] = best;
    }
}

function persist() {
    try {
        localStorage.setItem(storageKey, JSON.stringify({ expression, run, bests }));
        storageAvailable = true;
    } catch {
        storageAvailable = false;
    }
    $('save-status').textContent = storageAvailable
        ? 'Your settings and timer stay in this browser.'
        : 'Browser storage is unavailable. Changes last for this page visit.';
}

function renderExpression() {
    expression = $('expression').value;
    try {
        const result = formatExpression(evaluateExpression(expression));
        $('expression-result').textContent = result.main;
        $('expression-detail').textContent = result.detail;
        $('expression-error').hidden = true;
        $('expression').setAttribute('aria-invalid', 'false');
    } catch (error) {
        $('expression-result').textContent = '—';
        $('expression-detail').textContent = expression.trim() ? 'Check the expression above.' : 'Start typing to calculate.';
        $('expression-error').textContent = error.message;
        $('expression-error').hidden = !expression.trim();
        $('expression').setAttribute('aria-invalid', String(Boolean(expression.trim())));
    }
    persist();
}

$('expression').addEventListener('input', renderExpression);
for (const button of document.querySelectorAll('[data-expression]')) {
    button.addEventListener('click', () => {
        $('expression').value = button.dataset.expression;
        renderExpression();
        $('expression').focus();
    });
}

const stageElements = [];
let groupList;
STAGES.forEach((stage, index) => {
    if (stage.group && !groupList) {
        const group = document.createElement('li');
        group.className = 'stage-group';
        const title = document.createElement('p');
        title.className = 'stage-group-title';
        title.textContent = stage.group;
        groupList = document.createElement('ol');
        groupList.setAttribute('aria-label', stage.group);
        group.append(title, groupList);
        $('stages').append(group);
    }
    const row = document.createElement('li');
    row.className = 'stage-row';
    const number = document.createElement('span');
    number.className = 'stage-number';
    number.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'stage-name';
    name.textContent = stage.name;
    const label = document.createElement('label');
    label.className = 'budget-wrap';
    const budget = document.createElement('input');
    budget.className = 'budget-input';
    budget.type = 'number';
    budget.min = '1';
    budget.max = '120';
    budget.step = '1';
    budget.required = true;
    budget.value = run.budgets[index];
    budget.setAttribute('aria-label', `${stage.name} budget in minutes`);
    const unit = document.createElement('span');
    unit.textContent = 'm';
    label.append(budget, unit);
    const actual = document.createElement('span');
    actual.className = 'stage-actual';
    actual.textContent = '—';
    row.append(number, name, label, actual);
    (stage.group ? groupList : $('stages')).append(row);
    stageElements.push({ row, number, budget, actual });
    budget.addEventListener('input', () => {
        if (run.status !== 'idle') return;
        const valid = validateBudgets();
        if (valid) {
            run = createRun(stageElements.map(stage => stage.budget.valueAsNumber));
            persist();
            $('split-feedback').textContent = 'Mark a split when you’re ready for the next stage.';
        } else {
            $('split-feedback').textContent = 'Use whole minutes from 1 to 120 for every stage budget.';
        }
        renderRun();
    });
});

function validateBudgets() {
    let valid = true;
    for (const { budget } of stageElements) {
        budget.setAttribute('aria-invalid', String(!budget.validity.valid));
        valid &&= budget.validity.valid;
    }
    return valid;
}

function currentBest() { return bests[run.budgets.join('-')]; }

function renderRun() {
    const now = Date.now();
    const elapsed = elapsedTime(run, now);
    const total = run.budgets.reduce((sum, minutes) => sum + minutes, 0) * 60000;
    const complete = run.status === 'complete';
    const current = run.splits.length;
    widgets.setStage(current, run.status);
    const idle = run.status === 'idle';
    const validBudgets = validateBudgets();
    $('elapsed').textContent = formatTime(elapsed);
    $('total-budget').textContent = `/ ${formatTime(total)}`;
    $('run-status').textContent = { idle: 'READY WHEN YOU ARE', running: 'SESSION IN PROGRESS', paused: 'PAUSED', complete: 'SESSION COMPLETE' }[run.status];
    $('pace-label').textContent = elapsed > total ? `${formatTime(elapsed - total)} over plan` : idle ? `${formatTime(total)} planned` : `${formatTime(total - elapsed)} left`;
    document.querySelector('.timer-panel').classList.toggle('over-budget', elapsed > total);
    const percent = Math.min(100, elapsed / total * 100);
    $('progress-fill').style.width = `${percent}%`;
    $('run-progress').setAttribute('aria-valuenow', Math.round(percent));
    $('run-progress').setAttribute('aria-valuetext', `${formatTime(elapsed)} of ${formatTime(total)}`);
    $('stage-hint').textContent = complete ? 'Route complete. Take a moment to review where the time went.' : STAGES[current].hint;
    $('start-pause').textContent = { idle: 'Start session ↗', running: 'Pause Ⅱ', paused: 'Resume ↗', complete: 'Run again ↗' }[run.status];
    $('start-pause').disabled = idle && !validBudgets;
    $('split').disabled = run.status !== 'running';
    $('split').textContent = current === STAGES.length - 1 ? 'Finish ✓' : 'Split →';
    for (const [index, { row, number, budget, actual }] of stageElements.entries()) {
        const done = index < current;
        row.classList.toggle('done', done);
        row.classList.toggle('active', index === current && !complete);
        if (index === current && !complete) row.setAttribute('aria-current', 'step');
        else row.removeAttribute('aria-current');
        number.textContent = done ? '✓' : String(index + 1).padStart(2, '0');
        budget.disabled = !idle;
        const duration = done ? run.splits[index] - (run.splits[index - 1] || 0) : index === current && !idle ? elapsed - (run.splits[index - 1] || 0) : null;
        actual.textContent = duration === null ? '—' : formatTime(duration);
        actual.classList.toggle('over', duration !== null && duration > run.budgets[index] * 60000);
        actual.setAttribute('aria-label', `${STAGES[index].name} actual duration: ${duration === null ? 'not completed' : formatTime(duration)}`);
    }
    for (const button of document.querySelectorAll('[data-minutes]')) {
        button.disabled = !idle;
        button.setAttribute('aria-pressed', String(validBudgets && Number(button.dataset.minutes) * 60000 === total));
    }
    const best = currentBest();
    $('best-time').textContent = best ? formatTime(best.elapsed) : '—';
    $('clear-best').disabled = !best || run.status === 'running' || run.status === 'paused';
}

function resetRun() {
    run = createRun(run.budgets);
    stageElements.forEach(({ budget }, index) => { budget.value = run.budgets[index]; });
    $('split-feedback').textContent = 'Mark a split when you’re ready for the next stage.';
    persist();
    renderRun();
}

$('start-pause').addEventListener('click', () => {
    if (run.status === 'complete') resetRun();
    if (!validateBudgets()) return;
    run = run.status === 'running' ? pauseRun(run, Date.now()) : startRun(run, Date.now());
    persist();
    renderRun();
});

$('split').addEventListener('click', () => {
    if (run.status !== 'running') return;
    const index = run.splits.length;
    const best = currentBest();
    run = splitRun(run, Date.now());
    const target = run.budgets.slice(0, index + 1).reduce((sum, value) => sum + value, 0) * 60000;
    const delta = run.elapsed - (best ? best.splits[index] : target);
    const comparison = best ? 'best pace' : 'planned pace';
    const pace = Math.abs(delta) < 1000 ? `Matches ${comparison}.` : `${formatTime(Math.abs(delta))} ${delta > 0 ? 'behind' : 'ahead of'} ${comparison}.`;
    $('split-feedback').textContent = `${STAGES[index].name} done. ${pace}`;
    if (run.status === 'complete') {
        if (!best || run.elapsed < best.elapsed) {
            bests[run.budgets.join('-')] = { ...run, budgets: [...run.budgets], splits: [...run.splits] };
            $('split-feedback').textContent = best ? `New personal best: ${formatTime(run.elapsed)}. ${pace}` : `First run complete: ${formatTime(run.elapsed)}. Your splits are saved as the pace to compare against.`;
        } else {
            $('split-feedback').textContent = `Session complete: ${formatTime(run.elapsed)}. ${pace}`;
        }
    }
    persist();
    renderRun();
    if (run.status === 'complete') $('start-pause').focus();
});

$('reset-run').addEventListener('click', () => {
    if ((run.status === 'running' || run.status === 'paused') && !window.confirm('Reset this session? Your current splits will be cleared.')) return;
    resetRun();
});

for (const button of document.querySelectorAll('[data-minutes]')) {
    button.addEventListener('click', () => {
        if (run.status !== 'idle') return;
        const total = Number(button.dataset.minutes);
        const exact = STAGES.map(stage => stage.minutes / 45 * total);
        const budgets = exact.map(value => Math.max(1, Math.floor(value)));
        const remainderOrder = exact.map((value, index) => ({ index, fraction: value % 1 })).sort((a, b) => b.fraction - a.fraction);
        let remaining = total - budgets.reduce((sum, value) => sum + value, 0);
        for (const { index } of remainderOrder) { if (remaining-- > 0) budgets[index]++; }
        run = createRun(budgets);
        resetRun();
    });
}

$('clear-best').addEventListener('click', () => {
    delete bests[run.budgets.join('-')];
    persist();
    renderRun();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) renderRun(); });
$('expression').value = expression;
renderExpression();
if (run.status === 'complete') {
    $('split-feedback').textContent = `Session complete: ${formatTime(run.elapsed)}. Review your splits or start another run.`;
} else if (run.status === 'paused') {
    $('split-feedback').textContent = 'Session restored and paused. Resume when you’re ready.';
} else if (run.status === 'running') {
    $('split-feedback').textContent = `Session restored. Next split: ${STAGES[run.splits.length].name}.`;
}
renderRun();
setInterval(renderRun, 250);
