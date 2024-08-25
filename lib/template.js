import { getDom, customElements, isServer } from "./window.js";
const dom = getDom();
const Node = dom.window.Node;
const document = dom.window.document;

const arrayWriteOps = [
    'push', 'pop', 'shift', 'unshift', 'splice'
];

const defer = callback => {
    setTimeout(callback, 0);
};

/**
 * @typedef {function} NodeHandlerMethod
 * @param {Node} node
 * @return {(Node|Node[]|null)}
 */

/**
 * @typedef {function} NodeHandlerMethod
 * @param {Node} element
 * @param {Node} node
 * @return {(Node|Node[]|null)}
 */

/**
 * @typedef {Object} NodeHandler
 * @prop {NodeHandlerMethod} [element]
 * @prop {AttrNodeHandlerMethod} [attribute]
 * @prop {NodeHandlerMethod} [text]
 */

const INPUT_ELEMENT_TAG_LIST = [
    'input', 'textarea', 'select'
];

export default class Template {
    owner = null;

    #original = null;
    #parsed = null;
    #brain = null;
    #data = null;
    #hasInit = false;

    get content() {
        return this.#parsed;
    }

    get attributes() {
        return this.#original.cloneNode(true).attributes;
    }

    get data() {
        const makeProxy = (obj, path = []) => {
            return new Proxy(obj, {
                get: (target, prop) => {
                    if (null !== target[prop]
                        && typeof target[prop] === 'object'
                    ) {
                        return makeProxy(target[prop], [...path, prop]);
                    }

                    if (Array.isArray(target)
                        && typeof target[prop] === 'function'
                        && arrayWriteOps.includes(prop)
                    ) {
                        defer(() => {
                            this.#notify(path.join('.'));
                        });
                        return target[prop].bind(target);
                    }

                    return target[prop];
                },
                set: (target, prop, value) => {
                    if (target[prop] === value) {
                        // prevents infinte loops
                        // but may cause race conditions
                        // to fail your data-loop item
                        // listeners on initial data
                        return true;
                    }

                    target[prop] = value;
                    this.#notify([...path, prop].join('.'));
                    return true;
                },
            });
        };
        return makeProxy(this.#data);
    }

    /**
     * @param {DocumentFragment} content
     */
    constructor(content, owner = null) {
        this.#original = content;
        this.#brain = new EventTarget();

        this.#brain.addEventListener('update', ({path, value}) => {
            if (!this.owner) {
                return;
            }

            writeGraph(this.owner.data, path, value);
            if (typeof this.owner.update === 'function') {
                this.owner.update(path);
            }
        });

        if (content.tagName && content.tagName === 'TEMPLATE') {
            content = content.content;
        }

        this.#parsed = content.cloneNode(true);

        this.owner = owner;
    }

    async init(initialData, root) {
        if (this.#hasInit) return;

        if (!isServer) {
            root.innerHTML = '';
        }

        this.#data ??= initialData;
        await this.hydrate(this.#parsed);
        this.bindNode(this.#parsed);

        root.appendChild(this.#parsed);

        this.#hasInit = true;
    }

    getData(path) {
        return readGraph(this.#data, path);
    }

    setData(path, value) {
        writeGraph(this.#data, path, value);
        this.#notify(path);
    }

    addEventListener(type, listener, options = {}) {
        this.#brain.addEventListener(type, listener, options);
    }

    dispatchEvent(event) {
        return this.#brain.dispatchEvent(event);
    }

    /**
     * Runs the constructor for customComponents on the server-side
     * @param {DocumentFragment} doc
     */
    async hydrate(doc) {
        await Promise.all([...doc.querySelectorAll('*')].map(async node => {
            const constructor = customElements.get(node.tagName.toLowerCase());
            if (!constructor) return true;

            const bind = node.getAttribute('data-bind');
            const route = this.owner ? this.owner.route : null;

            const newNode = new constructor(route);
            newNode.append(...node.childNodes);
            node.parentNode.replaceChild(newNode, node);

            node.getAttributeNames().forEach(name => {
                newNode.setAttribute(name, node.getAttribute(name));
            });

            bind && this.bindDataBindAttributesNode(newNode);
            await newNode.whenInit();
            bind && this.#notify(bind);

            return true;
        }));
    }

    /**
     * All the binding types
     * @param {DocumentFragment} doc
     */
    bindNode(doc) {
        this.bindDataLoops(doc);
        this.bindDataIfAttributes(doc);
        this.bindAndReplaceDataTags(doc);
        this.bindDataBindAttributes(doc);
        this.bindUserEvents(doc);
    }

    /**
     * Deals with data-if attributes
     * @param {DocumentFragment} doc
     */
    bindDataIfAttributes(doc) {
        [...doc.querySelectorAll('[data-if]')].forEach(node => {
            const bind = node.getAttribute('data-if');

            if (bind.trim().length === 0) {
                throw new Error(`Empty data-if attribute in element ${node.tagName}`);
            }

            const placeholder = document.createComment(' ¯\_(ツ)_/¯ ');
            let visible = true;

            const remove = () => {
                if (!visible) return;
                node.replaceWith(placeholder);
                visible = false;
            };

            const insert = () => {
                if (visible) return;
                placeholder.replaceWith(node);
                visible = true;
            };

            const update = () => {
                const data = !!readGraph(this.#data, bind);

                if (data) return insert();
                return remove();
            };

            this.#brain.addEventListener(`update:${bind}`, update.bind(this));
            update();
        });
    }

    /**
     * Deals with data-loop attributes
     * @param {DocumentFragment} doc
     */
    bindDataLoops(doc) {
        [...doc.querySelectorAll('[data-loop]:not([data-item])')].forEach(node => {
            const parent = node.parentElement;
            const loop = node.getAttribute('data-loop');
            const indexBind = node.getAttribute("data-index") ?? null;
            const copy = node.cloneNode(true);

            let [ bind, iterator ] = loop.split(':');
            iterator ??= 'item';

            copy.removeAttribute("data-index");
            node.setAttribute('data-ignore', '');

            const refreshList = (firstRun = false) => {
                const data = readGraph(this.#data, bind) ?? [];

                const existing = [...(parent.querySelectorAll(`[data-loop="${loop}"][data-item]`) ?? [])]
                    .filter((item, i) => i < data.length || item.remove());

                (data ?? []).slice(existing.length).forEach((_, i) => {
                    const index = existing.length + i;

                    let subTemplate = copy.innerHTML
                        .replace(
                            new RegExp(`{{${iterator}((?:\.[^}]*)?)}}`, 'g'),
                            `{{${bind}.${index}$1}}`
                        )
                        .replace(
                            new RegExp(`data-bind="${iterator}((?:\.[^"]*)?)"`, 'g'),
                            `data-bind="${bind}.${index}$1"`,
                        )
                        .replace(
                            new RegExp(`data-loop="${iterator}((?:\.[^"]*)?)"`, 'g'),
                            `data-loop="${bind}.${index}$1"`,
                        )
                        .replace(
                            new RegExp(`data-if="${iterator}((?:\.[^"]*)?)"`, 'g'),
                            `data-if="${bind}.${index}$1"`,
                        );

                    if (indexBind) {
                        subTemplate = subTemplate
                            .replace(
                                new RegExp(`{{${indexBind}}}`, 'g'),
                                index
                            );
                    }

                    const itemNode = copy.cloneNode(true);
                    itemNode.innerHTML = subTemplate;
                    itemNode.setAttribute('data-item', index);

                    parent.insertBefore(itemNode, node);

                    if (firstRun) {
                        this.bindDataLoops(itemNode);
                    } else this.bindNode(itemNode);
                });
            };

            node.style.display = 'none';

            this.#brain.addEventListener(`update:${bind}`, () => {
                refreshList();
            });
            refreshList(true);
        });
    }

    /**
     * Deals with {{tags}} in content and attributes
     * @param {DocumentFragment} doc
     */
    bindAndReplaceDataTags(doc) {
        /** @type {NodeHandler} */
        const handler = {
            name: 'bindAndReplaceDataTags',
            text: /** @type {Text} */node => {
                const result = evenOddFlatBrackets(node.textContent, '{{', '}}')
                    .map((part, i) => {
                        const newNode = document.createTextNode(part);
                        if (i % 2 === 0) return newNode;

                        this.#brain.addEventListener(`update:${part}`, ({value}) => {
                            newNode.textContent = value;
                        });

                        const value = readGraph(this.#data, part) ?? part;
                        newNode.textContent = value;

                        return newNode;
                    });

                if (result.join('') !== node.textContent)
                    return result;
            },
            attribute: /** @type {Attr} */(element, node) => {
                const format = evenOddFlatBrackets(node.value, '{{', '}}');

                const updateValue = () => {
                    element.setAttribute(node.name, format.map((part, i) => {
                        if (i % 2 == 0) return part;
                        return readGraph(this.#data, part);
                    }).join(''));
                };

                format.forEach((bind, i) => {
                    if (i % 2 == 0) return;

                    this.#brain.addEventListener(`update:${bind}`, () => {
                        updateValue();
                    });
                });

                updateValue();
            },
        };

        traverseNodes(doc, handler);
    };

    /**
     * Deals with data-bind attributes for a single node
     * @param {Node} node
     */
    bindDataBindAttributesNode(node) {
        const bind = node.getAttribute('data-bind');

        if (bind.trim().length === 0) {
            throw new Error(`Empty data-bind attribute in element ${node.tagName}`);
        }

        const setElementValue = value => {
            const customConstructor = customElements.get(node.tagName.toLowerCase());

            if (customConstructor) {
                const boundData = typeof value !== 'object' ? {default: value} : value;
                node.data ??= {};
                node._boundData = boundData;
                Object.assign(node.data, boundData);
                return;
            }

            if (!INPUT_ELEMENT_TAG_LIST.includes(node.tagName.toLowerCase())) {
                node.innerHTML = value;
                return;
            }

            if (['checkbox', 'radio'].includes(node.getAttribute('type'))) {
                if (node.value === value) {
                    node.checked = true;
                }
                return;
            }

            node.value = value;

            // server-side
            node.setAttribute('value', value);
        };

        this.#brain.addEventListener(`update:${bind}`, ({value}) => {
            setElementValue(value);
        });

        if (INPUT_ELEMENT_TAG_LIST.includes(node.tagName.toLowerCase())) {
            node.addEventListener('change', () => {
                let value = node.value;

                if (node.type === 'checkbox') {
                    value = node.checked;
                }

                if (node.type === 'number') {
                    const step = parseFloat(node.getAttribute("step") ?? "1");
                    value = parseFloat(node.value);
                    if (step % 1 === 0) {
                        value = parseInt(node.value);
                    }
                }

                writeGraph(this.#data, bind, value);
                this.#notify(bind);
            });
        }

        setElementValue(readGraph(this.#data, bind));
    }

    /**
     * Deals with data-bind attributes
     * @param {DocumentFragment} doc
     */
    bindDataBindAttributes(doc) {
        [...doc.querySelectorAll('[data-bind]')].forEach(node => {
            this.bindDataBindAttributesNode(node);
        });
    };

    /**
     * Deals with data-on and data-once attributes
     * You can bind special params with `this` for the
     * triggered element and `event` for the event object
     * @param {DocumentFragment} doc
     */
    bindUserEvents(doc) {
        if (isServer) return;

        const handleEvent = (node, eventString, once = false) => {
            if (null === eventString) {
                return;
            }

            const [event, action] = eventString.split(':', 2);
            const [method, parameters] = (() => {
                let [method, parameters] = evenOddFlatBrackets(action, '(', ')');
                parameters = (parameters ?? '').split(',').map(p => p.trim()).filter(p => p);
                return [method, parameters];
            })();

            node.addEventListener(event, e => {
                let args = [e];

                if (!this.owner) {
                    return;
                }

                if (parameters.length > 0) {
                    args = parameters.map(path => {
                        if (path === 'this') {
                            return node;
                        }
                        if (path === 'event') {
                            return e;
                        }

                        return JSON.parse(JSON.stringify(readGraph(this.#data, path) ?? path));
                    });
                }

                const call = this.owner[method];
                if (typeof call !== 'function') {
                    return;
                }

                call.apply(this.owner, args);
            }, { once });
        };

        [...doc.querySelectorAll('[data-on]')].forEach(node => {
            const binds = node.getAttribute('data-on').split(';');
            binds.forEach(bind => {
                handleEvent(node, bind);
            });
        });

        [...doc.querySelectorAll('[data-once]')].forEach(node => {
            const binds = node.getAttribute('data-once').split(';');
            binds.forEach(bind => {
                handleEvent(node, bind, true);
            });
        });

        [...doc.querySelectorAll('a[href]')].forEach(node => {
            const url = node.getAttribute('href');

            if (/^((https?:)?\/\/|#)/.test(url)
                || url.startsWith('javascript:')) {
                // skip external and anchor links
                // but handle absolute links
                return;
            }

            node.addEventListener('click', e => {
                e.preventDefault();
                const event = new Event('navigate');
                event.url = url;
                this.#brain.dispatchEvent(event);
            });
        });

        // disable actionless forms from submitting when
        // you click normal buttons
        // or press enter (very annoying for SPAs)
        [...doc.querySelectorAll('form:not([action][method])')].forEach(node => {
            node.addEventListener('submit', e => e.preventDefault());
        });
    };

    /**
     * @typedef {Object} NotifyOptions
     * @prop {boolean} cascade Notifies children
     * @prop {boolean} bubble Notify ancestors
     */

    /**
     * @param {string} path
     * @param {NotifyOptions} options
     */
    #notify(path, options) {
        const defaults = {
            cascade: true,
            bubble: true,
        };
        options = Object.assign({}, defaults, options);

        const event = new Event(`update:${path}`);
        event.value = readGraph(this.#data, path);
        this.#brain.dispatchEvent(event);

        const parts = path.split('.');

        if (null !== event.value
            && typeof event.value === 'object'
            && options.cascade
        ) {
            Object.keys(event.value).forEach(child => {
                this.#notify([...parts, child].join('.'), {bubble: false});
            });
        }

        parts.pop();

        if (parts.length
            && options.bubble
        ) {
            this.#notify(parts.join('.'), {cascade: false});
        }
    }
}

/**
 * @param {(DocumentFragment|Node)} doc
 * @param {NodeHandler} handler
 */
function traverseNodes(doc, handler) {
    const replacements = [];

    const ignore = null !== (
        (doc.getAttribute ?? null)
        && doc.getAttribute('data-ignore')
    );

    if (ignore) {
        return;
    }

    (doc.childNodes ?? []).forEach(node => {
        let replacement = null;
        let nodes = [node];

        switch (node.nodeType) {
            case Node.ELEMENT_NODE:
                replacement = handler.element && handler.element(node);
                break;
            case Node.TEXT_NODE:
                replacement = handler.text && handler.text(node);
                break;
        }

        if (null !== replacement
            && typeof replacement !== 'undefined'
        ) {
            if (!Array.isArray(replacement)) {
                replacement = [replacement];
            }

            replacements.push({
                node,
                replacement,
            });

            nodes = replacement;
        }

        nodes.forEach(node => {
            Object.values(node.attributes ?? {}).forEach(attr => {
                handler.attribute && handler.attribute(node, attr);
            });

            traverseNodes(node, handler);
        });
    });

    replacements.forEach(({node, replacement}) => {
        replacement.forEach(newNode => {
            doc.insertBefore(newNode, node);
        });

        doc.removeChild(node);
    });
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

function readGraph(obj, path) {
    const names = path.split('.');

    return names.reduce((prev, name) => {
        if (null === prev
            || typeof prev === 'undefined'
        ) {
            return undefined;
        }

        return prev[name];
    }, obj);
}

function writeGraph(obj, path, value) {
    const names = path.split('.');
    const tip = names.pop();

    obj = names.reduce((prev, name) => {
        if (null === prev[name]
            || typeof prev[name] === 'undefined'
        ) {
            prev[name] = {};
        }

        return prev[name];
    }, obj);

    obj[tip] = value;
}
