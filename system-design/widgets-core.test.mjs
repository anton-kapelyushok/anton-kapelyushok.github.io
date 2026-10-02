import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityBudget, formatDowntime } from './widgets-core.mjs';

test('three nines gives the correct daily, monthly, and annual time budget', () => {
    const result = availabilityBudget(99.9);
    assert.ok(Math.abs(result.day - 86.4) < 1e-8);
    assert.ok(Math.abs(result.month - 2592) < 1e-8);
    assert.ok(Math.abs(result.year - 31536) < 1e-7);
    assert.equal(formatDowntime(result.day), '1m 26s');
    assert.equal(formatDowntime(result.month), '43m 12s');
    assert.equal(formatDowntime(result.year), '8h 45m 36s');
});

test('availability endpoints and tiny budgets remain meaningful', () => {
    assert.deepEqual(availabilityBudget(100), { day: 0, month: 0, year: 0 });
    assert.equal(formatDowntime(availabilityBudget(100).month), '0s');
    assert.equal(formatDowntime(availabilityBudget(0).month), '30d');
    assert.equal(formatDowntime(availabilityBudget(99.999).month), '26s');
    assert.equal(formatDowntime(availabilityBudget(99.999999).month), '25.92 ms');
    for (const value of [-1, 100.1, NaN, Infinity]) assert.throws(() => availabilityBudget(value));
});
