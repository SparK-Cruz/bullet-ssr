const isServer = typeof window === 'undefined';

// import(String()) prevents the bundler from
// delivering server-side stuff to client-side

const customElements = isServer
    ? (await import(String("./dom.js"))).customElements
    : (await import("./client.js")).customElements;

const Document = isServer
    ? (await import(String("./dom.js"))).Document
    : (await import("./client.js")).Document;

const HTMLElement = isServer
    ? (await import(String("./dom.js"))).HTMLElement
    : (await import("./client.js")).HTMLElement;

const fetchCache = {};

const fetchFile = isServer
    ? async url => {
        if (typeof fetchCache[url] !== 'undefined') {
            return fetchCache[url];
        }

        const fs = (await import(String('node:fs/promises')));
        const content = await fs.readFile(url, "utf-8");
        fetchCache[url] = content;
        return content;
    }
    : async url => {
        if (typeof fetchCache[url] !== 'undefined') {
            return fetchCache[url];
        }

        const request = await fetch(`/${url}`);
        const content = request.text();
        fetchCache[url] = content;
        return content;
    };

export {
    isServer,
    customElements,
    fetchFile,
    Document,
    HTMLElement,
}
