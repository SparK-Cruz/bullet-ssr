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

    constructor(component, element, customElementNames, customElements) {
        super();

        this.component = component;
        this.element = element;
        this.customElementNames = customElementNames;
        this.customElements = customElements;
        this.#parse(element);
    }

    #parse(node, alias = {}) {
        this.#parseDataLoop(node, alias);
        this.#parseTags(node, alias);
        this.#parseDataBind(node, alias);
        this.#parseDataIf(node, alias);
        this.#parseClientEvents(node);
    }

    #parseDataLoop(node, alias = {}) {
        (node.querySelectorAll('[data-loop]:not([data-item])') ?? []).forEach(child => {
            let [loopBind, localAlias] = child.getAttribute('data-loop').split(':');
            const indexAlias = child.getAttribute('data-index');
            let bind = loopBind;

            localAlias ??= 'item';

            const loop = child.cloneNode(true).innerHTML;

            Object.keys(alias).forEach(a => {
                bind = bind.split('.').map(p => {
                    return p.replace(RegExp(`^${a}$`), alias[a]);
                }).join('.');
            });

            this.addEventListener(`update:${bind}`, ({value}) => {
                if (typeof value[Symbol.iterator] !== 'function') {
                    value = [];
                }

                node.querySelectorAll(`[data-loop="${loopBind}"][data-item]`).forEach(item => {
                    item.remove();
                });

                [...value].forEach((itemValue, i) => {
                    const item = child.cloneNode(true);
                    item.innerHTML = loop;
                    item.style.display = '';
                    item.setAttribute('data-item', '');

                    const aliases = {
                        [localAlias]: `${bind}.${i}`,
                    };
                    if (indexAlias) {
                        aliases[indexAlias] = i;
                    }
                    this.#parse(item, Object.assign({}, alias, aliases));
                    child.parentNode.insertBefore(item, child);

                    // Redundant to the server, necessary on the client
                    // Abuses the two-way binding event triggers to generate
                    // a late cascade as we missed the original cascade
                    // by the time the new elements are in place
                    const event = new Event('change');
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
            let [bind, name] = child.getAttribute('data-bind').split(':');
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
                    }

                    await child.whenInit();
                    child.data[name] = value;
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

                const event = new Event('change');
                event.key = bind.split('.');
                event.value = value;

                this.dispatchEvent(event);
            });
        });
    }

    #parseDataIf(node, alias = {}) {
        (node.querySelectorAll('[data-if]') ?? []).forEach(child => {
            let bind = child.getAttribute('data-if');

            Object.keys(alias).forEach(a => {
                bind = bind.split('.').map(p => {
                    return p.replace(RegExp(`^${a}$`), alias[a]);
                }).join('.');
            });

            child.setAttribute('data-if', bind);

            this.addEventListener(`update:${bind}`, ({value}) => {
                child.style.display = (!!value) ? '' : 'none';
            });
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

        node.querySelectorAll('[data-on]').forEach(child => {
            this.#parseClientEventsSingleNode(this.component, child);
        });

        node.querySelectorAll('[data-once]').forEach(child => {
            this.#parseClientEventsSingleNode(this.component, child, true);
        });

        // a[href="/..."]
        //   [disabled] = prevent default
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
                e.preventDefault();

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
