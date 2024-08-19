import Template from "./template.js";
import { isServer, Document, HTMLElement, customElements } from "./window.js";

function renderTemplate(xhtml, owner) {
    const content = [...Document.parseHTMLUnsafe(xhtml)
        .querySelectorAll('template')].shift();
    return new Template(content, owner);
}

export default async function frag(name, xhtml, behavior = null) {
    behavior = behavior ?? {
        constructor() {
            console.warn(`NULL BEHAVIOR OBJECT FOR "${name}" COMPONENT`);
        }
    };

    class Base extends HTMLElement {
        _boundData = {};
        data = null;
        xhtml = null;
        shadow = null;
        route = null;

        #hasInit = false;

        constructor(route) {
            super();
            this.data = {};
            this.route = route;
            setTimeout(() => this.#fragInit(), 0);
        }

        async whenInit() {
            return await new Promise((resolve, reject) => {
                let limit = 1000;
                const interval = setInterval(() => {
                    if (this.#hasInit) {
                        clearInterval(interval);
                        resolve(true);
                    }

                    limit -= 5;
                    if (limit <= 0) {
                        clearInterval(interval);
                        reject(false);
                    }
                }, 5);
            });
        }

        async #fragInit() {
            if (this.#hasInit) return;

            const initData = await (async () => {
                const data = Object.assign({}, this.data);
                if (behavior.data && typeof behavior.data === 'function') {
                    behavior.data = await behavior.data.bind(this)();
                }
                Object.assign(data, behavior.data ?? {});
                return data;
            })();

            this.xhtml = xhtml;
            this.shadow = null;

            if (!isServer) {
                this.route ??= window.route;
            }

            const template = renderTemplate(xhtml, this);
            let shadow = this.shadowRoot;

            if (!shadow) {
                shadow = this.attachShadow({
                    mode: 'open'
                });
            }

            await template.init(initData, shadow);
            this.shadow = shadow;

            Object.values(template.attributes).forEach(({name, value}) => {
                this.setAttribute(name, value);
            });

            template.addEventListener('navigate', ({url}) => {
                this.route.router.navigate(url);
            });

            this.addEventListener = template.addEventListener.bind(template);
            this.dispatchEvent = template.dispatchEvent.bind(template);

            const behaviorInit = behavior.constructor.bind(this);
            const instanceBehavior = Object.assign({}, behavior);
            delete instanceBehavior.constructor;

            Object.assign(this, instanceBehavior, { data: template.data });
            Object.assign(this.data, this._boundData);

            frag.$next(() => {
                behaviorInit && behaviorInit.call(this);
            });

            this.#hasInit = true;
        }
    }

    customElements.define(name, Base);
    return Base;
}

export const html = String.raw;
export const css = String.raw;

frag.$next = (callback) => {
    if (isServer) {
        return;
    }
    setTimeout(callback, 0);
};
