import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression, formatExpression } from './expression.mjs';

function check(source, expected, bytes = 0, time = 0) {
    const result = evaluateExpression(source);
    assert.ok(Math.abs(result.value - expected) <= Math.max(1, Math.abs(expected)) * 1e-10, `${source}: ${result.value} ≠ ${expected}`);
    assert.equal(result.bytes, bytes);
    assert.equal(result.time, time);
    return result;
}

test('the requested monthly-storage expression cancels time units', () => {
    for (const month of ['month', 'months', 'month(s)', 'MONTH']) {
        const result = check(`100000 / day * 1 ${month} * 200 bytes`, 600000000, 1);
        assert.deepEqual(formatExpression(result), { main: '600 MB', detail: '600,000,000 bytes' });
    }
});

test('M and B mean million and billion, independently of data units', () => {
    check('1M', 1000000);
    check('1B', 1000000000);
    check('1.5 m + 2M', 3500000);
    check('1B * 2 KB', 2000000000000, 1);
    assert.equal(formatExpression(evaluateExpression('1B')).main, '1 B');
    assert.equal(formatExpression(evaluateExpression('1 byte')).main, '1 byte');
    assert.equal(formatExpression(evaluateExpression('1 byte')).detail, '1 byte');
});

test('byte units are decimal, while explicit binary units use powers of 1024', () => {
    check('1 TB / 1 GB', 1000);
    check('1 MB + 500 KB + 200 bytes', 1500200, 1);
    check('1 kib', 1024, 1);
    check('1 MiB', 1048576, 1);
});

test('daily and monthly rates retain a per-second dimension', () => {
    const daily = check('1M / DAY', 1000000 / 86400, 0, -1);
    assert.equal(formatExpression(daily).main, '11.57 / second');
    assert.equal(formatExpression(daily).detail, '1 M / day · 30 M / month');
    check('1B / MONTH', 1000000000 / (30 * 86400), 0, -1);
    check('100000 / day * 200 bytes', 100000 * 200 / 86400, 1, -1);
});

test('a 365-day year and 30-day month are explicit constants', () => {
    check('1 YEAR / 1 DAY', 365);
    check('1 MONTH / 1 DAY', 30);
    check('100 MB / DAY * YEAR', 36500000000, 1);
    check('1 month + 2 days', 32 * 86400, 0, 1);
    check('1 year / month', 365 / 30);
});

test('precedence, parentheses, signed values, scientific notation, and thousands separators', () => {
    check('(1M + 500K) / 2', 750000);
    check('2 + 3 * 4', 14);
    check('-2 * (3 - 5)', 4);
    check('1e6 / 1,000', 1000);
    check('1 MB × 2 ÷ 4', 500000, 1);
    check('0 / day * month * 200 bytes', 0, 1);
});

test('a time unit suffix is grouped with its number in a denominator', () => {
    check('1 / 2 days', 1 / (2 * 86400), 0, -1);
    check('1000 / (2 days) * 1 month', 15000);
});

test('mistakes and unfinished expressions produce useful errors', () => {
    for (const source of ['', '1M /', '(1M + 2', '1M 2', '1,,000', '10**2', 'window.alert(1)', '5; 6', '1e309']) {
        assert.throws(() => evaluateExpression(source), Error, source);
    }
    assert.throws(() => evaluateExpression('1MB + 1 day'), /matching units/);
    assert.throws(() => evaluateExpression('10 / 0'), /divide by zero/);
    assert.throws(() => evaluateExpression('1 banana'), /Unknown unit/);
    assert.throws(() => evaluateExpression('1'.repeat(501)), /500 characters/);
});

test('small rates do not silently display as zero', () => {
    const result = formatExpression(evaluateExpression('1 / YEAR'));
    assert.match(result.main, /3\.17e-8 \/ second/);
});

test('a trailing conversion changes the display unit without changing the quantity', () => {
    const result = check('1B bytes/month in KB/year', 1e9 / (30 * 86400), 1, -1);
    assert.ok(Math.abs(result.conversion.value - 1e6 * 365 / 30) < 1e-6);
    assert.equal(result.conversion.unit, 'KB/year');
    assert.equal(formatExpression(result).main, '12,166,667 KB/year');
});

test('conversion applies to the entire calculation and supports grouped arithmetic', () => {
    assert.equal(formatExpression(evaluateExpression('(1M * 200 bytes) / day in GB/month')).main, '6 GB/month');
    assert.equal(formatExpression(evaluateExpression('1 MB + 500 KB in KB')).main, '1,500 KB');
    assert.equal(formatExpression(evaluateExpression('100000 / day * 1 month(s) * 200 bytes in GB')).main, '0.6 GB');
});

test('explicit output units are retained even for large, small, zero, or negative results', () => {
    for (const [source, expected] of [
        ['1 TB in KB', '1,000,000,000 KB'],
        ['1 byte in TB', '1e-12 TB'],
        ['0 bytes in MB', '0 MB'],
        ['-2 KB in bytes', '-2,000 bytes'],
        ['1B in M', '1,000 M'],
        ['1 day in hours', '24 hour'],
        ['1M / day in 1/second', '11.57 / second'],
        ['1 MiB in KB', '1,048.6 KB'],
    ]) assert.equal(formatExpression(evaluateExpression(source)).main, expected, source);
});

test('conversion unit aliases, optional plurals, spacing, and case are consistent', () => {
    for (const source of [
        '1B BYTES / MONTH IN kb / YEAR',
        '1B bytes/month in KB/year(s)',
        '1B bytes/month in (KB/years)',
    ]) {
        const result = evaluateExpression(source);
        assert.ok(Math.abs(result.conversion.value - 1e6 * 365 / 30) < 1e-6);
    }
});

test('in must appear once at the end and its target contains units only', () => {
    for (const source of [
        '1 MB in KB in bytes', '(1 MB in KB) * 2', '(1 MB in KB)',
        '1 MB in KB * 2', '1 MB in KB + bytes', '1 MB in 2 KB',
        '1 MB in KB 2', '1 MB in', 'in KB', '1 MB in ()', '1 MB in KB/',
    ]) assert.throws(() => evaluateExpression(source), Error, source);
});

test('output units must match the dimensions of the calculated quantity', () => {
    for (const source of ['1 MB in day', '1 MB/day in KB', '1 MB in KB/year', '1B in bytes']) {
        assert.throws(() => evaluateExpression(source), /units do not match/, source);
    }
});

test('the requested count-rate conversion accepts commas, spaces, and plural seconds', () => {
    for (const target of ['1 / seconds', 'seconds', 'second(s)', '(SECONDS)']) {
        const result = check(`10,000,000,000 / day in  ${target}`, 1e10 / 86400, 0, -1);
        assert.equal(formatExpression(result).main, '115,741 / second');
    }
});

test('count labels equal one in singular, plural, optional-plural, and uppercase forms', () => {
    for (const [singular, plural] of [['request', 'requests'], ['event', 'events'], ['user', 'users'], ['unit', 'units']]) {
        for (const suffix of [singular, plural, `${singular}(s)`, plural.toUpperCase()]) {
            const result = check(`1M ${suffix}`, 1e6);
            assert.deepEqual(evaluateExpression(suffix), evaluateExpression('1'));
            assert.deepEqual(result, evaluateExpression('1M'));
            assert.equal(formatExpression(result).main, '1 M');
        }
    }
});

test('rps expands to requests per second and can be used on either side of in', () => {
    assert.equal(formatExpression(evaluateExpression('1M request(s)/day in rps')).main, '11.57 rps');
    assert.equal(formatExpression(evaluateExpression('100 RPS in requests/day')).main, '8,640,000 requests/day');
    assert.equal(formatExpression(evaluateExpression('1 request/second + 2 rps')).main, '3 / second');
    assert.equal(formatExpression(evaluateExpression('1 rps * 1 day in requests')).main, '86,400 requests');
});

test('active-user aliases support request-per-user estimates and monthly periods', () => {
    assert.equal(formatExpression(evaluateExpression('1M dau * 20 requests/user in rps')).main, '231.48 rps');
    assert.equal(formatExpression(evaluateExpression('30M MAU * 20 requests/user in rps')).main, '231.48 rps');
    assert.equal(formatExpression(evaluateExpression('1M users/day in dau')).main, '1,000,000 DAU');
    assert.equal(formatExpression(evaluateExpression('1M users/month in mau')).main, '1,000,000 MAU');
    assert.equal(formatExpression(evaluateExpression('1M MAU * month in users')).main, '1,000,000 users');
});

test('count labels do not affect payload calculations', () => {
    assert.equal(formatExpression(evaluateExpression('100K events/day * 1 month * 200 bytes/event in MB')).main, '600 MB');
    assert.equal(formatExpression(evaluateExpression('1M users * 200 bytes/user in MB')).main, '200 MB');
    assert.equal(formatExpression(evaluateExpression('200 bytes/event')).main, '200 bytes');
    assert.equal(formatExpression(evaluateExpression('1 / user')).main, '1');
    assert.equal(formatExpression(evaluateExpression('2 users * 3 requests')).main, '6');
    assert.equal(formatExpression(evaluateExpression('10 requests * 200 bytes in KB')).main, '2 KB');
});

test('counts can be mixed or omitted while byte and time dimensions remain enforced', () => {
    assert.equal(formatExpression(evaluateExpression('1 user + 1 request + 1')).main, '3');
    assert.equal(formatExpression(evaluateExpression('10 users in events')).main, '10 events');
    assert.equal(formatExpression(evaluateExpression('86400 events/day in rps')).main, '1 rps');
    assert.equal(formatExpression(evaluateExpression('10 / second in rps')).main, '10 rps');
    assert.equal(formatExpression(evaluateExpression('10^6 / day in rps')).main, '11.57 rps');
    for (const source of ['10 dau in mau/second', '10 requests in bytes']) {
        assert.throws(() => evaluateExpression(source), /units do not match/, source);
    }
});

test('bare time units change a rate denominator without losing its numerator', () => {
    for (const [source, expected] of [
        ['86400 requests/day in seconds', '1 / second'],
        ['1M events/day in hours', '41,667 / hour'],
        ['240 users/day in hours', '10 / hour'],
        ['2 rps in minutes', '120 / minute'],
        ['86400 bytes/day in seconds', '1 bytes/second'],
        ['2/day in months', '60 / month'],
        ['1M dau in seconds', '11.57 / second'],
    ]) assert.equal(formatExpression(evaluateExpression(source)).main, expected, source);
});

test('bare time conversion preserves duration semantics and rejects unrelated dimensions', () => {
    assert.equal(formatExpression(evaluateExpression('2 days in hours')).main, '48 hour');
    assert.equal(formatExpression(evaluateExpression('2 hours in seconds')).main, '7,200 second');
    for (const source of ['1 MB in seconds', '10 users in hours', '10 / day / day in seconds']) {
        assert.throws(() => evaluateExpression(source), /units do not match/, source);
    }
});

test('powers work as counts with units, time conversions, and magnitude suffixes', () => {
    check('10^6', 1000000);
    assert.equal(formatExpression(evaluateExpression('10^6 requests/day in rps')).main, '11.57 rps');
    assert.equal(formatExpression(evaluateExpression('10^10 / day in seconds')).main, '115,741 / second');
    assert.equal(formatExpression(evaluateExpression('10^6 bytes in MB')).main, '1 MB');
    assert.equal(formatExpression(evaluateExpression('(10^6 + 500K) users')).main, '1.5 M');
    assert.equal(formatExpression(evaluateExpression('10^6 dau * 20 requests/user in rps')).main, '231.48 rps');
});

test('powers precede multiplication, associate right, and support signed or grouped exponents', () => {
    check('2 * 10^3 + 5', 2005);
    check('2^3^2', 512);
    check('-2^2', -4);
    check('(-2)^2', 4);
    check('10^-6', 0.000001);
    check('10^(2 + 4)', 1000000);
    check('9^0.5', 3);
    check('(-2)^-3', -0.125);
    check('1 / 10^6 seconds', 0.000001, 0, -1);
    check('(2 KB)^2 / KB', 4000, 1);
});

test('incomplete, unitful, overflowing, and non-real powers have clear errors', () => {
    assert.throws(() => evaluateExpression('10^'), /Finish the expression/);
    assert.throws(() => evaluateExpression('10^(2 seconds)'), /without units/);
    assert.throws(() => evaluateExpression('(2 bytes)^0.5'), /whole-number power/);
    assert.throws(() => evaluateExpression('10^1000'), /too large/);
    assert.throws(() => evaluateExpression('bytes^1e20'), /unit power is too large/);
    assert.throws(() => evaluateExpression('0^-1'), /divide by zero/);
    assert.throws(() => evaluateExpression('(-2)^0.5'), /real-number result/);
});
