import "@testing-library/jest-dom";

process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
        get length() { return Object.keys(store).length; },
        key: (index: number) => Object.keys(store)[index] || null,
    };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// jsdom doesn't implement matchMedia — needed by any component using
// prefers-reduced-motion (e.g. useReducedMotion in the deploy cinematic).
// Individual test files can still override this with their own mock (see
// use-reduced-motion.test.ts) when they need to simulate a specific query
// state; this just gives every other test a working default instead of a
// hard crash.
if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }),
    });
}

// jsdom doesn't implement these — Radix's Select (and other Radix primitives
// using pointer capture / viewport scrolling) throw without them, so any
// test that opens a shadcn <Select> in jsdom needs this polyfilled globally.
if (typeof Element.prototype.hasPointerCapture !== "function") {
    Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
    Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
    Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = () => {};
}
