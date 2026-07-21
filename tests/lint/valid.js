const STRUCTURAL_OFFSET = 2;

export function increment(value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    return value + STRUCTURAL_OFFSET;
}
