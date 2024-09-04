import spotter from "./spotter.js";
import Template from "./template.js";
import { customElements, Document, HTMLElement } from "./window.js";

export const html = String.raw;
export const css = String.raw;

const frags = [];
export const fragNames = [];

export async function initAll() {
    return await Promise.all(frags);
}

/**
 * @overload
 * @param {string} tagName
 * @param {string} bhtml
 * @param {object} behavior
 * @returns {class}
 */

/**
 * @overload
 * @param {string} tagName
 * @param {string} bhtml
 * @param {string} bcss
 * @param {object} behavior
 * @returns {class}
 */
export default function frag(...args) {
    let [
        tagName, bhtml, bcss, behavior
    ] = args;

    if (typeof bcss === 'object' && null !== bcss) {
        behavior = bcss;
        bcss = null;
    }

    bcss ??= '';

    const external = { tagName, bhtml, bcss, behavior, frags, fragNames, customElements };

    class Fragment extends HTMLElement {
        static external = external;

        _isFragment = true;

        #hasInit = false;

        #data = {};
        #dataSpotter = null;
        #engine = null;

        route = null;

        constructor(extra) {
            super();

            Object.assign(this, extra);

            this.initialize();

            external.frags.push(this.whenInit());
        }

        whenInit() {
            return new Promise((resolve, reject) => {
                const check = () => {
                    if (this.#hasInit) {
                        resolve(true);
                        return true;
                    }
                    return false;
                };

                // Check immediately
                if (check()) {
                    return;
                }

                // Not innited yet? Check next cicle
                setTimeout(() => {
                    if (check()) {
                        return;
                    }

                    // Not innited yet? Check every 100ms
                    const interval = setInterval(() => {
                        if (check()) {
                            clearInterval(interval);
                        }
                    }, 100);
                }, 0);
            });
        }

        get data() {
            if (!this.#dataSpotter) {
                this.#dataSpotter = spotter(this.#data);
            }

            return this.#dataSpotter;
        }

        async initialize() {

            // route finding block

            this.route ??= this.window.route;

            if (!this.route) {
                // traverse up looking for a parent with route
                let parent = this;
                while(parent = parent.parentNode) {
                    if (parent.route) {
                        this.route ??= parent.route;
                        break;
                    }
                }
            }

            // shadow root block

            const doc = this.document.createElement('bullet-loader-element');
            doc.route = this.route;
            doc.innerHTML = external.bhtml;

            const template = doc.querySelector('template');
            const root = template.content.cloneNode(true);
            const style = this.document.createElement('style');

            style.innerHTML = external.bcss;
            root.prepend(style);

            if (!this.shadowRoot) {
                this.attachShadow({
                    mode: 'open'
                });
            }

            this.shadowRoot.replaceChildren(root);


            // template behavior block

            const reserved = [
                'constructor',
                'data'
            ];

            Object.keys(external.behavior).forEach(key => {
                if (reserved.includes(key)) {
                    return;
                }

                this[key] = external.behavior[key];
            });

            this.#engine = new Template(this, this.shadowRoot, external.fragNames, external.customElements);

            // Data bus block
            //     We can avoid structure being async
            //     But we can't avoid data being async

            this.data.addEventListener('update:*', ({key, value}) => {
                const event = new Event(`update:${key.join('.')}`);
                event.value = value ?? key.reduce((prev, part) => {
                    if (prev === null) return null;
                    if (typeof prev === 'undefined') return null;
                    return prev[part];
                }, this.data);

                this.#engine.dispatchEvent(event);
            });

            this.#engine.addEventListener('input-bind-change', ({key, value, noBubbling = false}) => {
                const tip = key.pop();
                let parent = key.reduce((prev, part) => {
                    if (typeof prev[part] === 'undefined') {
                        throw new Error(`Bullet cannot update data to unmapped data structures: "${key.join('.')}"!`);
                    }
                    return prev[part];
                }, this.data);

                if (noBubbling) {
                    parent = parent._noBubbling;
                }

                parent[tip] = value;
            });

            // Data init block

            (async () => {
                const initData = (typeof external.behavior.data === 'function'
                    ? await external.behavior.data.call(this)
                    : external.behavior.data ?? {}
                )

                Object.assign(this.data, initData);

                // This is how frags can have async constructors
                if (typeof external.behavior.constructor === 'function') {
                    await external.behavior.constructor.call(this);
                }

                this.#hasInit = true;
            })();
        }

        getElementById(id) {
            return this.shadowRoot.getElementById(id);
        }

        querySelector(query) {
            return this.shadowRoot.querySelector(query);
        }

        querySelectorAll(query) {
            return this.shadowRoot.querySelectorAll(query);
        }

        addEventListener(type, listener, options = null) {
            return this.#engine.addEventListener(type, listener, options);
        }

        dispatchEvent(event) {
            const carrier = new Event(event.type);
            carrier.value = event.value;
            return this.#engine.dispatchEvent(carrier);
        }

        $client(callback) {
            if (typeof window === 'undefined') {
                return;
            }

            callback();
        }

        $next(callback) {
            this.$client(() => {
                // Warning to game devs: this is tied to FPS (LOL)
                window.requestAnimationFrame(callback);
            });
        }
    }

    customElements.define(tagName, Fragment);
    fragNames.push(tagName);
    return Fragment;
}
