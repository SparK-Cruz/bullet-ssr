import * as assert from "node:assert";
import { describe, it } from 'node:test';

import { JSDOM } from "jsdom";

const dom = new JSDOM();
const { document, customElements, HTMLElement } = dom.window;

const greeting = "Hello, World!";

customElements.define('test-greeter', class extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `<h1>${greeting}</h1>`;
    }
});

customElements.define('test-subject', class extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = "<test-greeter></test-greeter>";
    }
});

describe("JSDOM", async () => {
    it("Should render nested custom element", test => {
        document.body.innerHTML = "<test-subject></test-subject>";
        assert.ok(dom.serialize().includes(greeting), "Should contain the greeting");
    });
});
