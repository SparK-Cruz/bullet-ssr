// If `isServer` gets exported it
// means I'm doing something wrong!
const isServer = typeof window === 'undefined';

const {
    customElements,
    Document,
    HTMLElement,
    document,
} = await [
    async () => window,
    async () => global.window
][Number(isServer)]();

const fetchFile = [
    async url => {
        const request = await fetch(url);
        return request.text();
    },
    async url => {
        const fs = (await import('node:fs/promises'));
        return await fs.readFile(url, "utf-8");
    },
][Number(isServer)];

export {
    customElements,
    Document,
    HTMLElement,
    document,
    fetchFile
}
