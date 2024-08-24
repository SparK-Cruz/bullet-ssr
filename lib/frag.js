import Template from "./template.js";
import { isServer, Document, HTMLElement, customElements } from "./window.js";

function renderTemplate(xhtml, owner) {
    const content = [...Document.parseHTMLUnsafe(xhtml)
        .querySelectorAll('template')].shift();

    if (!content) {
        throw new Error(`
            Invalid fragment xhtml:
            - Did you await fetchTemplate?
            - Is your content wrapped in a root template element?
        `);
    }

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

        static observedAttributes = behavior.observedAttributes ?? [];

        constructor(route) {
            super();
            this.data = {};
            this.route = route;
            if (!isServer) {
                this.route ??= window.route;
            }
            setTimeout(this.#fragInit.bind(this), 0);
        }

        whenInit() {
            return new Promise((resolve, reject) => {
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
            this.getElementById = (id) => {
                return this.shadow.getElementById(id);
            }
            this.querySelector = (query) => {
                return this.shadow.querySelector(query);
            }
            this.querySelectorAll = (query) => {
                return this.shadow.querySelectorAll(query);
            }

            const behaviorInit = behavior.constructor.bind(this);
            const instanceBehavior = Object.assign({}, behavior);
            delete instanceBehavior.constructor;

            Object.assign(this, instanceBehavior, { data: template.data });
            Object.assign(this.data, this._boundData);

            behaviorInit && await behaviorInit.call(this);

            this.#hasInit = true;
        }

        async $next(callback) {
            await this.whenInit();
            frag.$next(callback);
        }
    }

    customElements.define(name, Base);
    return Base;
}

export const html = String.raw;
export const css = String.raw;

frag.$next = (callback, delay = null) => {
    if (isServer) {
        return;
    }
    window.requestAnimationFrame(() => {
        if (null === delay) {
            callback();
            return;
        }

        setTimeout(callback, delay);
    });
};
