import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import frag, { html, css, initAll } from "../lib/frag.js";
import DOM from "../lib/dom.js";

import pretty from "pretty";

const pageHtml = html`
    <template>
        <test-frag data-bind="info.number"></test-frag>
    </template>
`;
await frag("test-page", pageHtml, {
    data: () => ({
        info: {number: 7}
    })
});

const fragHtml = html`
    <template>
        <test-sub>{{default}}</test-sub>
    </template>
`;
const fragCss = css`
    span {
        color: red;
    }
`;
await frag("test-frag", fragHtml, fragCss, {});

const subHtml = html`
    <template>
        <span><slot></slot></span>
        <span data-loop="list">{{item}}</span>
    </template>
`
await frag("test-sub", subHtml, {});

describe("Frag data-bind", async () => {
    it("Should work on template parsing", async () => {
        const dom = new DOM();
        dom.window.document.body.innerHTML = '<body><test-page></test-page></body>';

        assert.strictEqual((await dom.serialize()).includes('7'), true);
    });
});
