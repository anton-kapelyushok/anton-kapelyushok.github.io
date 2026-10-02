import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatQuantity, formatTime,
    createRun, elapsedTime, startRun, pauseRun, splitRun, validRun,
} from './core.mjs';

test('decimal units and times remain readable over one hour', () => {
    assert.equal(formatQuantity(2190000000000, 'B'), '2.19 TB');
    assert.equal(formatQuantity(1000, 'B'), '1 KB');
    assert.equal(formatQuantity(8000000, 'bps'), '8 Mbps');
    assert.equal(formatTime(3661000), '61:01');
    assert.equal(formatTime(-100), '00:00');
});

test('pause excludes time while paused; reload preserves a running clock', () => {
    let run = startRun(createRun(), 1000);
    assert.equal(elapsedTime(run, 6500), 5500);
    run = pauseRun(run, 6500);
    assert.equal(elapsedTime(run, 20000), 5500);
    run = startRun(run, 20000);
    const restored = JSON.parse(JSON.stringify(run));
    assert.equal(validRun(restored), true);
    assert.equal(elapsedTime(restored, 24500), 10000);
});

test('splits are cumulative and finishing freezes the final duration', () => {
    let run = startRun(createRun(), 0);
    for (let index = 1; index <= 5; index++) {
        run = splitRun(run, index * 60000);
        assert.equal(validRun(run), true);
    }
    assert.deepEqual(run.splits, [60000, 120000, 180000, 240000, 300000]);
    assert.equal(run.status, 'complete');
    assert.equal(elapsedTime(run, 999999), 300000);
    assert.deepEqual(splitRun(run, 999999), run);
});

test('idle or paused sessions cannot add splits and over-budget runs keep counting', () => {
    const idle = createRun();
    assert.deepEqual(splitRun(idle, 1000), idle);
    const paused = pauseRun(startRun(idle, 0), 1000);
    assert.deepEqual(splitRun(paused, 2000), paused);
    assert.equal(elapsedTime(startRun(idle, 0), 3600000), 3600000);
});

test('corrupt saved sessions cannot resume', () => {
    const run = createRun();
    for (const invalid of [null, {}, { ...run, budgets: [5] }, { ...run, elapsed: -1 }, { ...run, status: 'running' }, { ...run, status: 'complete' }, { ...run, status: 'paused', elapsed: 100, splits: [90, 80] }]) {
        assert.equal(validRun(invalid), false);
    }
});
