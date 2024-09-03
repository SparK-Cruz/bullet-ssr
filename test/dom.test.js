import * as assert from "node:assert";
import { describe, it } from 'node:test';

import DOM, { customElements, Document } from "../lib/dom.js";
import { HTMLElement } from "../lib/window.js";

const dom = new DOM();
const { document } = dom.window;

const ghtml = `
    <template>
        <h1>Hello, World!</h1>
    </template>
`;
let external = { ghtml };
class GreeterElement extends HTMLElement {
    static external = external;

    constructor() {
        super();

        const shadow = this.attachShadow({
            mode: 'open'
        });

        shadow.append(Document.parseHTMLUnsafe(external.ghtml).querySelector('template').content.cloneNode(true));
    }
}
customElements.define('test-greeter', GreeterElement);

const xhtml = `
    <template>
        <test-greeter></test-greeter>
    </template>
`;
external = { xhtml };
class CustomElement extends HTMLElement {
    static external = external;

    constructor() {
        super();

        const shadow = this.attachShadow({
            mode: 'open'
        });

        shadow.append(Document.parseHTMLUnsafe(external.xhtml).querySelector('template').content.cloneNode(true));
    }
}
customElements.define('test-page', CustomElement);

describe("DOM", async () => {
    it("Should render shadowDOM", async () => {
        document.body.innerHTML = '<test-page></test-page>';
        assert.ok((await dom.serialize()).includes('Hello, World!'), "Should contain a greeting");
    });
});
