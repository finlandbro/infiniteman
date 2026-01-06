class DoubleDouble {
    constructor(hi, lo = 0) {
        this.hi = hi;
        this.lo = lo;
    }

    static fromNumber(value) {
        return new DoubleDouble(value, 0);
    }

    static zero() {
        return new DoubleDouble(0, 0);
    }

    clone() {
        return new DoubleDouble(this.hi, this.lo);
    }

    static twoSum(a, b) {
        const s = a + b;
        const bb = s - a;
        const err = (a - (s - bb)) + (b - bb);
        return [s, err];
    }

    static quickTwoSum(a, b) {
        const s = a + b;
        const err = b - (s - a);
        return [s, err];
    }

    static twoProd(a, b) {
        const p = a * b;
        const splitter = 134217729; // 2^27 + 1
        const aSplit = splitter * a;
        const aHigh = aSplit - (aSplit - a);
        const aLow = a - aHigh;
        const bSplit = splitter * b;
        const bHigh = bSplit - (bSplit - b);
        const bLow = b - bHigh;
        const err = ((aHigh * bHigh - p) + aHigh * bLow + aLow * bHigh) + aLow * bLow;
        return [p, err];
    }

    copyFrom(other) {
        this.hi = other.hi;
        this.lo = other.lo;
        return this;
    }

    static add(aHi, aLo, bHi, bLo, result) {
        const [s, e] = DoubleDouble.twoSum(aHi, bHi);
        const loSum = aLo + bLo;
        const [hi, lo] = DoubleDouble.quickTwoSum(s, e + loSum);
        result.hi = hi;
        result.lo = lo;
    }

    static sub(aHi, aLo, bHi, bLo, result) {
        const [s, e] = DoubleDouble.twoSum(aHi, -bHi);
        const loSum = aLo - bLo;
        const [hi, lo] = DoubleDouble.quickTwoSum(s, e + loSum);
        result.hi = hi;
        result.lo = lo;
    }

    static mul(aHi, aLo, bHi, bLo, result) {
        const [p, err] = DoubleDouble.twoProd(aHi, bHi);
        const cross = aHi * bLo + aLo * bHi;
        const [hi, lo] = DoubleDouble.quickTwoSum(p, err + cross + aLo * bLo);
        result.hi = hi;
        result.lo = lo;
    }

    static square(aHi, aLo, result) {
        const [p, err] = DoubleDouble.twoProd(aHi, aHi);
        const cross = 2.0 * aHi * aLo;
        const [hi, lo] = DoubleDouble.quickTwoSum(p, err + cross + aLo * aLo);
        result.hi = hi;
        result.lo = lo;
    }

    add(other) {
        const [s, e] = DoubleDouble.twoSum(this.hi, other.hi);
        const loSum = this.lo + other.lo;
        const [hi, lo] = DoubleDouble.quickTwoSum(s, e + loSum);
        return new DoubleDouble(hi, lo);
    }

    sub(other) {
        return this.add(other.neg());
    }

    mul(other) {
        const [p, err] = DoubleDouble.twoProd(this.hi, other.hi);
        const cross = this.hi * other.lo + this.lo * other.hi;
        const [hi, lo] = DoubleDouble.quickTwoSum(p, err + cross + this.lo * other.lo);
        return new DoubleDouble(hi, lo);
    }

    square() {
        const [p, err] = DoubleDouble.twoProd(this.hi, this.hi);
        const cross = 2.0 * this.hi * this.lo;
        const [hi, lo] = DoubleDouble.quickTwoSum(p, err + cross + this.lo * this.lo);
        return new DoubleDouble(hi, lo);
    }

    neg() {
        return new DoubleDouble(-this.hi, -this.lo);
    }

    addNumber(value) {
        return this.add(DoubleDouble.fromNumber(value));
    }

    subNumber(value) {
        return this.addNumber(-value);
    }

    mulNumber(value) {
        if (value === 0) return DoubleDouble.zero();
        if (value === 1) return this.clone();
        if (value === -1) return this.neg();
        if (value === 2) return this.add(this);

        const [p, err] = DoubleDouble.twoProd(this.hi, value);
        const cross = this.lo * value;
        const [hi, lo] = DoubleDouble.quickTwoSum(p, err + cross);
        return new DoubleDouble(hi, lo);
    }

    abs() {
        if (this.hi < 0 || (this.hi === 0 && this.lo < 0)) {
            return this.neg();
        }
        return this.clone();
    }

    compare(other) {
        if (this.hi > other.hi) return 1;
        if (this.hi < other.hi) return -1;
        if (this.lo > other.lo) return 1;
        if (this.lo < other.lo) return -1;
        return 0;
    }

    greaterThan(other) {
        return this.compare(other) > 0;
    }

    greaterThanNumber(value) {
        return this.greaterThan(DoubleDouble.fromNumber(value));
    }

    toNumber() {
        return this.hi + this.lo;
    }
}

class DoubleDoubleStepper {
    constructor(initialValue, delta) {
        this.value = initialValue.clone();
        this.delta = delta;
    }

    current() {
        return this.value.clone();
    }

    advance() {
        this.value = this.value.add(this.delta);
    }
}
