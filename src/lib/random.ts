export const random = (): number => {
    const { crypto, Uint32Array } = window;
    if (
        typeof crypto?.getRandomValues === "function" &&
        typeof Uint32Array === "function"
    ) {
        // Divide a random UInt32 by the maximum value (2^32 -1) to get a result between 0 and 1
        return window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967295;
    }

    return random();
};