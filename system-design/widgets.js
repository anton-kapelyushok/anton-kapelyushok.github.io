import { formatNumber } from './core.mjs';
import { availabilityBudget, formatDowntime, REQUIREMENTS } from './widgets-core.mjs';

export function initializeWidgets() {
    const $ = id => document.getElementById(id);
    const storageKey = 'system-design-workbench:v1';
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Use defaults when storage is unavailable. */ }
    let availability = 99.9;
    try { availabilityBudget(saved.availability); availability = saved.availability; } catch { /* Use the default SLO. */ }
    const checks = {};
    for (const group of REQUIREMENTS) for (const [id] of group.items) checks[id] = saved.checks?.[id] === true;

    function persist() {
        try {
            localStorage.setItem(storageKey, JSON.stringify({ availability, checks }));
            $('workbench-save-error').hidden = true;
        } catch {
            $('workbench-save-error').hidden = false;
        }
    }

    function renderAvailability() {
        const value = $('availability-input').valueAsNumber;
        try {
            const result = availabilityBudget(value);
            $('availability-input').setAttribute('aria-invalid', 'false');
            $('availability-error').hidden = true;
            for (const period of ['day', 'month', 'year']) $(`downtime-${period}`).textContent = formatDowntime(result[period]);
            $('error-budget').textContent = `${formatNumber(100 - value)}% error budget`;
            availability = value;
            persist();
        } catch (error) {
            $('availability-input').setAttribute('aria-invalid', 'true');
            $('availability-error').textContent = error.message;
            $('availability-error').hidden = false;
            for (const period of ['day', 'month', 'year']) $(`downtime-${period}`).textContent = '—';
            $('error-budget').textContent = 'Check the availability target';
        }
        for (const button of document.querySelectorAll('[data-availability]')) button.setAttribute('aria-pressed', String(Number(button.dataset.availability) === value));
    }
    $('availability-input').value = availability;
    $('availability-input').addEventListener('input', renderAvailability);
    for (const button of document.querySelectorAll('[data-availability]')) button.addEventListener('click', () => {
        $('availability-input').value = button.dataset.availability;
        renderAvailability();
    });

    const checklistGroups = REQUIREMENTS.map((group, index) => {
        const details = document.createElement('details');
        details.className = 'check-group'; details.open = index === 0;
        const summary = document.createElement('summary');
        const title = document.createElement('span'); title.textContent = group.name;
        const count = document.createElement('span'); count.className = 'group-count';
        summary.append(title, count); details.append(summary);
        const inputs = group.items.map(([id, labelText, hint]) => {
            const label = document.createElement('label'); label.className = 'requirement-item';
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checks[id];
            input.setAttribute('aria-label', labelText);
            const copy = document.createElement('span');
            const title = document.createElement('strong'); title.textContent = labelText;
            const description = document.createElement('span'); description.textContent = hint;
            copy.append(title, description); label.append(input, copy); details.append(label);
            input.addEventListener('change', () => { checks[id] = input.checked; renderChecklist(); persist(); });
            return { id, input };
        });
        $('requirements-groups').append(details);
        return { details, count, inputs };
    });

    function renderChecklist() {
        let total = 0;
        let checked = 0;
        for (const { count, inputs } of checklistGroups) {
            const done = inputs.filter(({ id }) => checks[id]).length;
            count.textContent = `${done}/${inputs.length}`;
            checked += done; total += inputs.length;
        }
        $('requirements-count').textContent = `${checked} of ${total} covered`;
        $('requirements-progress').style.width = `${checked / total * 100}%`;
        $('clear-requirements').disabled = checked === 0;
    }
    $('clear-requirements').addEventListener('click', () => {
        for (const { inputs } of checklistGroups) for (const { id, input } of inputs) { checks[id] = false; input.checked = false; }
        renderChecklist(); persist();
    });

    renderAvailability(); renderChecklist();
    let lastStage = '';
    return {
        setStage(index, status) {
            const key = `${index}:${status}`;
            if (lastStage === key) return;
            lastStage = key;
            const active = status === 'running' || status === 'paused';
            checklistGroups.forEach(({ details }, current) => {
                const selected = active && index === current;
                details.classList.toggle('current-split', selected);
                if (selected) details.open = true;
            });
            $('requirements-stage').textContent = active ? `Current split: ${REQUIREMENTS[index].name}` : 'Follow the prompts as you move through your splits.';
        },
    };
}
