import Template from "./template.js";

const { Document, HTMLElement, customElements } = await import("./window.js");

function renderTemplate(xhtml) {
    return new Template([...Document.parseHTMLUnsafe(xhtml)
        .head
        .children].shift());
}

export default function frag(name, xhtml, behavior = null) {
    const template = renderTemplate(xhtml);

    behavior = behavior ?? {
        constructor() {
            console.warn(`EMPTY BEHAVIOR OBJECT FOR "${name}" COMPONENT`);
        }
    };

    class Base extends HTMLElement {
        xhtml = null;

        constructor(...args) {
            super();

            this.xhtml = xhtml;

            if (!this.shadowRoot) {
                const content = template.content;
                this.attachShadow({
                    mode: 'open'
                })
                .appendChild(content);

                [...template.attributes].forEach(({name, value}) => {
                    this.setAttribute(name, value);
                });
            }

            behavior.constructor.call(this, ...args);
        }
    }

    customElements.define(name, Base);
    return Base;
}

export const html = String.raw;
export const css = String.raw;
