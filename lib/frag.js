import Template from "./template.js";

const { Document, HTMLElement, customElements } = await import("./window.js");

function renderTemplate(xhtml, owner) {
    const content = [...Document.parseHTMLUnsafe(xhtml)
        .querySelectorAll('template')].shift();
    return new Template(content, owner);
}

export default async function frag(name, xhtml, behavior = null) {
    const initData = await (async () => {
        const data = behavior.data ?? {};
        if (typeof data === 'function') {
            return await data();
        }
        return data;
    })();

    behavior = behavior ?? {
        constructor() {
            console.warn(`EMPTY BEHAVIOR OBJECT FOR "${name}" COMPONENT`);
        }
    };

    class Base extends HTMLElement {
        xhtml = null;
        shadow = null;

        constructor(...args) {
            super();

            this.xhtml = xhtml;
            this.shadow = null;

            const template = renderTemplate(xhtml, this);
            let shadow = this.shadowRoot;

            if (!shadow) {
                shadow = this.attachShadow({
                    mode: 'open'
                });

                template.init(initData);
            }

            shadow.innerHTML = '';
            shadow.appendChild(template.content);

            Object.values(template.attributes).forEach(({name, value}) => {
                this.setAttribute(name, value);
            });

            this.shadow ??= template.init(initData, shadow);

            const behaviorInit = behavior.constructor;
            delete behavior.constructor;

            Object.assign(this, behavior);
            frag.$next(() => {
                behaviorInit && behaviorInit.call(this, ...args);
            });
        }
    }

    customElements.define(name, Base);
    return Base;
}

export const html = String.raw;
export const css = String.raw;

frag.$next = (callback) => {
    if (typeof window === 'undefined') {
        return;
    }
    setTimeout(callback, 0);
};
