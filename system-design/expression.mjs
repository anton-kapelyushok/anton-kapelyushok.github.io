import { SECONDS_PER_DAY, formatNumber, formatQuantity } from './core.mjs';

const dimensions = ['bytes', 'time'];
const quantity = (value, bytes = 0, time = 0) => ({ value, bytes, time });
const matchingDimensions = (left, right) => dimensions.every(dimension => left[dimension] === right[dimension]);
const units = new Map();
const unitLabels = new Map();
function unit(names, value, bytes = 0, time = 0, label = names.split(' ')[0]) {
    for (const name of names.split(' ')) {
        units.set(name, quantity(value, bytes, time));
        unitLabels.set(name, label);
    }
}
unit('k thousand', 1e3, 0, 0, 'K');
unit('m million', 1e6, 0, 0, 'M');
unit('b billion', 1e9, 0, 0, 'B');
unit('t trillion', 1e12, 0, 0, 'T');
unit('byte bytes', 1, 1, 0, 'bytes');
unit('kb', 1e3, 1, 0, 'KB');
unit('mb', 1e6, 1, 0, 'MB');
unit('gb', 1e9, 1, 0, 'GB');
unit('tb', 1e12, 1, 0, 'TB');
unit('pb', 1e15, 1, 0, 'PB');
unit('kib', 1024, 1, 0, 'KiB');
unit('mib', 1024 ** 2, 1, 0, 'MiB');
unit('gib', 1024 ** 3, 1, 0, 'GiB');
unit('tib', 1024 ** 4, 1, 0, 'TiB');
unit('s sec second seconds', 1, 0, 1, 'second');
unit('min minute minutes', 60, 0, 1, 'minute');
unit('h hr hour hours', 3600, 0, 1, 'hour');
unit('d day days', SECONDS_PER_DAY, 0, 1, 'day');
unit('week weeks', 7 * SECONDS_PER_DAY, 0, 1);
unit('month months', 30 * SECONDS_PER_DAY, 0, 1);
unit('year years', 365 * SECONDS_PER_DAY, 0, 1);
// Count labels are dimensionless: they make an estimate readable without restricting it.
unit('request requests', 1, 0, 0, 'requests');
unit('event events', 1, 0, 0, 'events');
unit('user users', 1, 0, 0, 'users');
unit('unit units', 1, 0, 0, 'units');
unit('rps', 1, 0, -1, 'rps');
unit('dau', 1 / SECONDS_PER_DAY, 0, -1, 'DAU');
unit('mau', 1 / (30 * SECONDS_PER_DAY), 0, -1, 'MAU');

// Parse a small arithmetic grammar; never execute user-supplied JavaScript.
export function evaluateExpression(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Enter a number or expression.');
    if (source.length > 500) throw new Error('Keep expressions to 500 characters or fewer.');
    const input = source.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-')
        .replace(/\b(bytes?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|requests?|events?|users?|units?)\s*\(s\)/gi, '$1');
    let tokens = [];
    let offset = 0;
    while (offset < input.length) {
        const rest = input.slice(offset);
        const match = /^(\s+|(?:\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z]+|[()+*/^\-])/.exec(rest);
        if (!match) throw new Error(`Unexpected “${rest[0]}”. Use numbers, units, + − * / ^ and parentheses.`);
        offset += match[0].length;
        if (match[0].trim()) tokens.push(match[0]);
    }
    if (tokens.length > 150) throw new Error('This expression is too long.');
    const conversions = tokens.map((token, index) => token.toLowerCase() === 'in' ? index : -1).filter(index => index >= 0);
    let targetTokens;
    if (conversions.length) {
        const boundary = conversions[0];
        const depth = tokens.slice(0, boundary).reduce((depth, token) => depth + (token === '(' ? 1 : token === ')' ? -1 : 0), 0);
        if (conversions.length > 1 || depth !== 0) throw new Error('Use “in <unit>” once, at the end of the complete expression.');
        if (boundary === 0) throw new Error('Enter a calculation before “in”.');
        targetTokens = tokens.slice(boundary + 1);
        tokens = tokens.slice(0, boundary);
        if (!targetTokens.length) throw new Error('Add an output unit after “in”, such as KB/year.');
    }
    let position = 0;
    function checked(result) {
        if (!Number.isFinite(result.value)) throw new Error('The result is too large.');
        return result;
    }
    function multiply(left, right, divide = false) {
        if (divide && right.value === 0) throw new Error('Cannot divide by zero.');
        const sign = divide ? -1 : 1;
        const result = quantity(divide ? left.value / right.value : left.value * right.value);
        for (const dimension of dimensions) result[dimension] = left[dimension] + sign * right[dimension];
        return checked(result);
    }
    function atom() {
        const token = tokens[position++];
        if (token === undefined) throw new Error('Finish the expression with a number, unit, or closing parenthesis.');
        if (token === '(') {
            const result = sum();
            if (tokens[position++] !== ')') throw new Error('Add the missing closing parenthesis.');
            return result;
        }
        if (/^[a-z]/i.test(token)) {
            const result = units.get(token.toLowerCase());
            if (!result) throw new Error(`Unknown unit “${token}”. Use a number suffix, data or time unit, request, event, user, rps, DAU, or MAU.`);
            return { ...result };
        }
        if (/^[\d.]/.test(token)) {
            return checked(quantity(Number(token.replaceAll(',', ''))));
        }
        throw new Error(`Unexpected “${token}”. Check the operators and parentheses.`);
    }
    function power() {
        const base = atom();
        if (tokens[position] !== '^') return base;
        position++;
        // Right-associative; unary signs bind after powers, so -2^2 is -(2^2).
        const exponent = unary();
        if (!matchingDimensions(exponent, quantity(1))) throw new Error('A power must be a number without units.');
        const hasUnits = dimensions.some(dimension => base[dimension] !== 0);
        if (hasUnits && !Number.isInteger(exponent.value)) throw new Error('Use a whole-number power for quantities with units.');
        if (base.value === 0 && exponent.value < 0) throw new Error('Cannot divide by zero.');
        const result = quantity(base.value ** exponent.value);
        if (Number.isNaN(result.value)) throw new Error('This power does not have a real-number result.');
        for (const dimension of dimensions) {
            result[dimension] = base[dimension] * exponent.value || 0;
            if (!Number.isSafeInteger(result[dimension])) throw new Error('The unit power is too large.');
        }
        return checked(result);
    }
    function unary() {
        if (tokens[position] === '+' || tokens[position] === '-') {
            const negative = tokens[position++] === '-';
            const result = unary();
            return { ...result, value: negative ? -result.value : result.value };
        }
        return power();
    }
    function term() {
        let result = unary();
        // Suffixes follow the completed power: 10^6 requests means (10^6) requests.
        // They still bind within a divisor: 1 / 2 DAY means 1 / (2 DAY).
        while (position < tokens.length && /^[a-z]/i.test(tokens[position])) result = multiply(result, unary());
        return result;
    }
    function product() {
        let result = term();
        while (tokens[position] === '*' || tokens[position] === '/') {
            const divide = tokens[position++] === '/';
            result = multiply(result, term(), divide);
        }
        return result;
    }
    function sum() {
        let result = product();
        while (tokens[position] === '+' || tokens[position] === '-') {
            const subtract = tokens[position++] === '-';
            const right = product();
            if (!matchingDimensions(result, right)) throw new Error('Add or subtract matching units, such as 1 MB + 500 KB.');
            result = checked({ ...result, value: result.value + (subtract ? -right.value : right.value) });
        }
        return result;
    }
    const result = sum();
    if (position !== tokens.length) throw new Error(`Add an operator before “${tokens[position]}”.`);
    if (targetTokens) {
        // The suffix selects units only; arithmetic with quantities stays before "in".
        let targetPosition = 0;
        function targetAtom() {
            const token = targetTokens[targetPosition++];
            if (token === '(') {
                const result = targetProduct();
                if (targetTokens[targetPosition++] !== ')') throw new Error('Close the parentheses around the output unit.');
                return result;
            }
            if (token === '1') return quantity(1);
            const result = units.get(token?.toLowerCase());
            if (!result) throw new Error('After “in”, use units only, such as KB, KB/year, or 1/second. Put calculations before “in”.');
            return { ...result };
        }
        function targetProduct() {
            let result = targetAtom();
            while (targetTokens[targetPosition] === '*' || targetTokens[targetPosition] === '/') {
                const divide = targetTokens[targetPosition++] === '/';
                result = multiply(result, targetAtom(), divide);
            }
            return result;
        }
        const target = targetProduct();
        if (targetPosition !== targetTokens.length) throw new Error('After “in”, use units only, such as KB/year. Put calculations before “in”.');
        const label = targetTokens.map(token => unitLabels.get(token.toLowerCase()) || token).join('');
        const bareTarget = targetTokens.filter(token => token !== '(' && token !== ')');
        const isBareTimeUnit = bareTarget.length === 1 && matchingDimensions(target, quantity(1, 0, 1));
        if (isBareTimeUnit && result.time === -1) {
            // "in seconds" selects the denominator of a rate, preserving its other units.
            const converted = result.value * target.value;
            checked(quantity(converted));
            return { ...result, conversion: {
                value: converted,
                unit: quantityLabel(result, { time: unitLabels.get(bareTarget[0].toLowerCase()) }),
            } };
        }
        if (!matchingDimensions(result, target)) throw new Error(`Cannot convert to ${label}: the units do not match. Keep the same quantity type, such as requests/second to rps.`);
        const converted = result.value / target.value;
        checked(quantity(converted));
        return { ...result, conversion: { value: converted, unit: label } };
    }
    return result;
}

function quantityLabel(result, labels = {}) {
    const numerator = [];
    const denominator = [];
    for (const dimension of dimensions) {
        const exponent = result[dimension];
        if (exponent === 0) continue;
        const name = labels[dimension] || (dimension === 'time' ? 'seconds' : dimension);
        const label = `${name}${Math.abs(exponent) === 1 ? '' : `^${Math.abs(exponent)}`}`;
        (exponent > 0 ? numerator : denominator).push(label);
    }
    const numeratorLabel = numerator.join(' · ') || '1';
    const denominatorLabel = denominator.length > 1 ? `(${denominator.join(' · ')})` : denominator[0];
    return denominator.length ? `${numeratorLabel}/${denominatorLabel}` : numeratorLabel;
}

function dataSize(value) {
    return Math.abs(value) < 1000 ? `${formatNumber(value)} ${value === 1 ? 'byte' : 'bytes'}` : formatQuantity(value, 'B');
}

export function formatExpression(result) {
    const { value, bytes, time } = result;
    if (result.conversion) {
        const { conversion, ...original } = result;
        const { main } = formatExpression(original);
        const unit = conversion.unit.startsWith('1/') ? `/ ${conversion.unit.slice(2)}` : conversion.unit;
        return { main: `${formatNumber(conversion.value)} ${unit}`, detail: `Equivalent to ${main}` };
    }
    if (bytes === 0 && time === 0) return { main: formatQuantity(value), detail: `${formatNumber(value)} total` };
    if (bytes === 1 && time === 0) return { main: dataSize(value), detail: `${formatNumber(value)} ${value === 1 ? 'byte' : 'bytes'}` };
    if (time === -1 && (bytes === 0 || bytes === 1)) {
        const format = bytes === 1 ? dataSize : formatQuantity;
        return {
            main: `${format(value)} / second`,
            detail: `${format(value * SECONDS_PER_DAY)} / day · ${format(value * SECONDS_PER_DAY * 30)} / month`,
        };
    }
    if (bytes === 0 && time === 1) return { main: `${formatNumber(value / SECONDS_PER_DAY)} days`, detail: `${formatNumber(value)} seconds` };
    const dimensionLabel = [bytes && `bytes${bytes === 1 ? '' : `^${bytes}`}`, time && `seconds${time === 1 ? '' : `^${time}`}`].filter(Boolean).join(' · ');
    return { main: `${formatNumber(value)} ${dimensionLabel}`, detail: 'Result in base units; negative powers indicate division.' };
}
