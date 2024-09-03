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

const fetchFile = isServer
    ? async url => {
        const fs = (await import(String('node:fs/promises')));
        return await fs.readFile(url, "utf-8");
    }
    : async url => {
        const request = await fetch(`/${url}`);
        return request.text();
    };

export {
    isServer,
    customElements,
    fetchFile,
    Document,
    HTMLElement,
}
