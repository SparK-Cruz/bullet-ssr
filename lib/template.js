const isServer = typeof window === 'undefined';
const document = isServer
    ? await (async() => {
        const dom = new (await import(String("jsdom"))).JSDOM();
        return dom.window.document;
      })()
    : (await import("./client.js")).document

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const INPUT_ELEMENT_TAG_LIST = [
    'input', 'textarea', 'select'
];

export default class Template extends EventTarget {
    component = null;
    element = null;
    customElementNames = null;
    customElements = null;

    eventHandlers = {};

    constructor(component, element, customElementNames, customElements) {
        super();

        this.component = component;
        this.element = element;
        this.customElementNames = customElementNames;
        this.customElements = customElements;
        this.#parse(element);
    }

    addEventListener(type, handler, options) {
        super.addEventListener(type, handler, options);

        this.eventHandlers[type] ??= [];
        this.eventHandlers[type].push(handler);
    }

    removeEventListener(type, handler = null) {
        let handlers = [handler];

        if (!handler) {
            handlers = this.eventHandlers[type];
        }

        (handlers ?? []).forEach(handler => {
            super.removeEventListener(type, handler);
        });
    }

    removeAllEventListeners(filter = null) {
        Object.keys(this.eventHandlers).forEach(type => {
            if (filter(type) || filter === null) {
                this.removeEventListener(type);
            }
        });
    }

    #parse(node, alias = {}) {
        this.#forceUpgradeCustomComponents(node);
        this.#parseDataLoop(node, alias);
        this.#parseTags(node, alias);
        this.#parseDataBind(node, alias);
        this.#parseDataIf(node, alias);
        this.#parseClientEvents(node);
    }

    #forceUpgradeCustomComponents(node) {
        this.customElementNames.forEach(name => {
            node.querySelectorAll(name).forEach(child => {
                if (typeof child._isFragment === 'undefined') {
                    this.customElements.upgrade(child);
                }

                child.route ??= this.component.route;
            });
        });
    }

    #parseDataLoop(node, alias = {}) {
        (node.querySelectorAll('[data-loop]:not([data-item])') ?? []).forEach(child => {
            const loopBind = child.getAttribute('data-loop');
            let [bind, localAlias] = loopBind.split(':');
            const indexAlias = child.getAttribute('data-index');

            localAlias ??= 'item';

            const loop = child.cloneNode(true).innerHTML;

            Object.keys(alias).forEach(a => {
                bind = bind.split('.').map(p => {
                    return p.replace(RegExp(`^${a}$`), alias[a]);
                }).join('.');
            });

            this.addEventListener(`update:${bind}`, ({value}) => {
                value ??= [];

                if (typeof value[Symbol.iterator] !== 'function') {
                    value = [];
                }

                node.querySelectorAll(`[data-loop="${loopBind}"][data-item]`).forEach((item, i) => {
                    if (i < value.length) {
                        return;
                    }
                    item.remove();
                });

                [...value].forEach((itemValue, i) => {
                    let item = node.querySelector(`[data-loop="${loopBind}"][data-item="${i}"]`);
                    if (!item) {
                        item = child.cloneNode(true);
                        item.innerHTML = loop;
                        item.style.display = '';
                        item.setAttribute('data-item', i);

                        const aliases = {
                            [localAlias]: `${bind}.${i}`,
                        };
                        if (indexAlias) {
                            aliases[indexAlias] = i;
                        }
                        child.parentNode.insertBefore(item, child);
                        this.#parse(item, Object.assign({}, alias, aliases));
                        this.#parseDataIfSingleNode(item, Object.assign({}, alias, aliases));
                    }

                    // Redundant to the server, necessary on the client
                    // Abuses the two-way binding event triggers to generate
                    // a late cascade as we missed the original cascade
                    // by the time the new elements are in place
                    const event = new Event('input-bind-change');
                    event.key = `${bind}.${i}`.split('.');
                    event.value = itemValue;
                    event.noBubbling = true; // prevents infinite loops
                    this.dispatchEvent(event);
                });
            });

            child.style.display = 'none';
        });
    }

    #parseTags(node, alias = {}) {
        this.#parseTagsOnTextNodes(node, alias);
        this.#parseTagsOnAttributes(node, alias);
    }

    #parseTagsOnTextNodes(node, alias = {}) {
        // Copy the NodeList into an Array
        // so we can modify the original without bugs
        [...node.childNodes].forEach(child => {
            if (child.nodeType === TEXT_NODE) {
                const match = evenOddFlatBrackets(child.textContent, '{{', '}}');

                if (match.length > 1) {
                    match.map((part, i) => {
                        const newNode = document.createTextNode(part);
                        if (i % 2 === 0) return newNode;

                        Object.keys(alias).forEach(a => {
                            part = part.split('.').map(p => {
                                return p.replace(RegExp(`^${a}$`), alias[a]);
                            }).join('.');
                        });

                        this.addEventListener(`update:${part}`, ({value}) => {
                            newNode.textContent = value;
                        });

                        newNode.textContent = '';
                        return newNode;
                    }).forEach((newNode, i, a) => {
                        node.insertBefore(newNode, child);
                    });
                    node.removeChild(child);
                }
            }

            if (child.nodeType === ELEMENT_NODE) {
                this.#parseTags(child, alias);
            }
        });
    }

    #parseTagsOnAttributes(node, alias = {}) {
        Object.values(node.attributes ?? {}).forEach(attr => {
            const key = attr.name;
            const value = attr.value;

            const match = evenOddFlatBrackets(value, '{{', '}}');

            match.forEach((part, i) => {
                if (i % 2 == 0) return;

                Object.keys(alias).forEach(a => {
                    part = part.split('.').map(p => {
                        return p.replace(RegExp(`^${a}$`), alias[a]);
                    }).join('.');
                });

                this.addEventListener(`update:${part}`, ({value}) => {
                    match[i] = value;
                    node.setAttribute(key, match.join(''));
                });

                // We need this to have the original text (or alias)
                // for those data-loop data-index stuff
                match[i] = part;
            });

            node.setAttribute(key, match.join(''));
        });
    }

    #parseDataBind(node, alias = {}) {
        (node.querySelectorAll('[data-bind]') ?? []).forEach(child => {
            const binds = child.getAttribute('data-bind').split(';').map(b => b.trim());
            binds.forEach(bindString => {
                let [bind, name] = bindString.split(':').map(b => b.trim());
                name ??= 'default';

                Object.keys(alias).forEach(a => {
                    bind = bind.split('.').map(p => {
                        return p.replace(RegExp(`^${a}$`), alias[a]);
                    }).join('.');
                });

                // Data to component
                this.addEventListener(`update:${bind}`, async ({value}) => {
                    // beware changes on two-way binding writing redundant updates
                    if (this.customElementNames.includes(child.tagName?.toLowerCase())) {
                        if (typeof child._isFragment === 'undefined') {
                            // Force upgrade
                            this.customElements.upgrade(child);
                            child.route = this.component.route;
                        }

                        await child.whenInit();
                        const path = name.split('.');
                        const tip = path.pop();
                        const obj = path.reduce((prev, part) => {
                            if (typeof prev[part] !== 'object' || null === prev[part]) {
                                throw new Error(`Bullet bind data to unmapped data structures: "${name}"!`);
                            }
                            return prev[part];
                        }, child.data);
                        obj[tip] = value;
                        return;
                    }

                    if (!INPUT_ELEMENT_TAG_LIST.includes(child.tagName?.toLowerCase())) {
                        child.innerHTML = value;
                        return;
                    }

                    if (['checkbox', 'radio'].includes(child.getAttribute('type'))) {
                        if (child.value === value) {
                            child.checked = true;
                        }
                        return;
                    }

                    child.value = value;

                    // server-side
                    child.setAttribute('value', value);
                });

                // Two way binding: component to data
                // (that is, if `frag` listens to it)
                child.addEventListener('change', () => {
                    let value = child.value;

                    if (child.type === 'checkbox') {
                        value = child.checked;
                    }

                    if (child.type === 'number') {
                        const step = parseFloat(child.getAttribute("step") ?? "1");
                        value = parseFloat(child.value);
                        if (step % 1 === 0) {
                            value = parseInt(child.value);
                        }
                    }

                    const event = new Event('input-bind-change');
                    event.key = bind.split('.');
                    event.value = value;
                    event.origin = child;

                    this.dispatchEvent(event);
                });
            });
        });
    }

    #parseDataIf(node, alias = {}) {
        (node.querySelectorAll('[data-if]') ?? []).forEach(child => {
            this.#parseDataIfSingleNode(child, alias);
        });
    }

    #parseDataIfSingleNode(node, alias = {}) {
        let bind = node.getAttribute('data-if');
        if (!bind) return;

        Object.keys(alias).forEach(a => {
            bind = bind.split('.').map(p => {
                return p.replace(RegExp(`^${a}$`), alias[a]);
            }).join('.');
        });

        node.setAttribute('data-if', bind);

        const placeholder = document.createComment('•');
        let hidden = false;

        this.addEventListener(`update:${bind}`, ({value}) => {
            if ((!value) && !hidden) {
                node.parentNode?.replaceChild(placeholder, node);
                hidden = true;
            }

            if ((!!value) && hidden) {
                placeholder.parentNode?.replaceChild(node, placeholder);
                hidden = false;
            }
        });
    }

    #parseClientEvents(node) {
        if (isServer) return;

        // Disable all forms with implicit actions
        node.querySelectorAll('form:not([action])').forEach(form => {
            form.addEventListener('submit', e => {
                e.preventDefault();
            });
        });

        // Handle internal navigation links
        node.querySelectorAll('a').forEach(child => {
            child.addEventListener('click', e => {
                const href = child.getAttribute('href');
                const disabled = child.getAttribute('disabled') !== null;

                if (!href.match(/^\/(?:[^\/]|$)/)) {
                    if (disabled) {
                        e.preventDefault();
                    }
                    return;
                }

                e.preventDefault();
                if (disabled) return;
                this.component.route.router.navigate(href);
            });
        });

        // custom events
        node.querySelectorAll('[data-on]').forEach(child => {
            this.#parseClientEventsSingleNode(this.component, child);
        });

        node.querySelectorAll('[data-once]').forEach(child => {
            this.#parseClientEventsSingleNode(this.component, child, true);
        });
    }

    #parseClientEventsSingleNode(parent, node, once = false) {
        const bindName = once ? 'data-once' : 'data-on';
        const listenOptions = {once};

        const binds = (node.getAttribute(bindName) ?? '')
            .split(';')
            .filter(b => b)
            .map(b => Object.fromEntries(
                b.split(':', 2)
                    .map((p, i) => [['bind', 'call'][i], p])
            ));

        binds.forEach(({bind, call}) => {
            const match = evenOddFlatBrackets(call, '(', ')').filter(p => p);
            if (match.length > 2) {
                throw Error(`Invalid bullet event bind: "${call}"!`);
            }

            const method = match.shift();
            const params = (match.shift() || '').split(',').map(p => p.trim()).filter(p => p);

            if (typeof parent[method] !== 'function') {
                throw Error(`Unkown method in bullet event bind: "${call}"!`);
            }

            node.addEventListener(bind, e => {
                parent[method](...params.map(p => {
                    if (p === 'this') {
                        return node;
                    }

                    if (p === 'event') {
                        return e;
                    }

                    return p;
                }));
            }, listenOptions);
        });
    }
}

function evenOddFlatBrackets(text, open, close) {
    const escape = symbol => symbol.replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const openCount = (text.match(new RegExp(escape(open), 'g')) || []).length;
    const closeCount = (text.match(new RegExp(escape(close), 'g')) || []).length;

    if (openCount !== closeCount) {
        throw new Error("Unmatched brackets!");
    }

    return text.split(open).map(opened => {
        const closed = opened.split(close);
        if (closed.length > 2) {
            throw new Error("Nested brackets!");
        }
        return closed;
    })
    .flat();
}
