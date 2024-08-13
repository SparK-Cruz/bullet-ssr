import { document } from "./window.js";

/**
 * @typedef {function} NodeHandlerMethod
 * @param {Node} node
 * @return {(Node|Node[]|null)}
 */

/**
 * @typedef {Object} NodeHandler
 * @prop {NodeHandlerMethod} [element]
 * @prop {NodeHandlerMethod} [attribute]
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
    #data = {};
    #hasInit = false;

    get content() {
        return this.#parsed;
    }

    /**
     * @param {DocumentFragment} content
     */
    constructor(content) {
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
    }

    init(initialData, owner = null) {
        if (this.#hasInit) return;

        const doc = this.#original.cloneNode(true);

        this.#data = initialData;

        this.bindAndReplaceDataTags(doc);
        this.bindDataAttributes(doc);
        this.bindEvents(doc);

        this.owner = owner;
        this.#parsed = doc;

        this.#hasInit = true;
    }

    getData(path) {
        return readGraph(this.#data, path);
    }

    setData(path, value) {
        writeGraph(this.#data, path, value);
        this.#notify(path);
    }

    /**
     * Deals with {{tags}} in content and attributes
     * @param {DocumentFragment} doc
     */
    bindAndReplaceDataTags(doc) {
        /** @type {NodeHandler} */
        const handler = {
            text: /** @type {Text} */node => {
                return evenOddFlatBrackets(node.textContent, '{{', '}}')
                    .map((part, i) => {
                        const newNode = document.createTextNode(part);
                        if (i % 2 === 0) return newNode;

                        this.#brain.addEventListener(`update:${part}`, ({value}) => {
                            newNode.textContent = value;
                        });

                        return newNode;
                    });
            },
            attribute: /** @type {Attr} */node => {
                const [value, bind] = evenOddFlatBrackets(node.value, '{{', '}}');

                if (value.trim().length > 0) {
                    return;
                }

                if (bind.trim().length === 0) {
                    throw new Error(`Empty bind tag in attribute ${node.name}`);
                }

                this.#brain.addEventListener(`update:${bind}`, ({value}) => {
                    node.value = value;
                });
            },
        };

        traverseNodes(doc, handler);
    };

    /**
     * Deals with data-bind attributes
     * @param {DocumentFragment} doc
     */
    bindDataBindAttributes(doc) {
        const inputElements = INPUT_ELEMENT_TAG_LIST;

        const handler = {
            element: /** @type {HTMLElement} */node => {
                Object.entries(node.attributes).forEach(([name, bind]) => {
                    if (!['data-bind'].includes(name)) {
                        return;
                    }

                    if (bind.trim().length === 0) {
                        throw new Error(`Empty data-bind attribute in element ${node.tagName}`);
                    }

                    this.#brain.addEventListener(`update:${bind}`, ({value}) => {
                        if (customElements.get(node.tagName.toLowerCase())) {
                            node.data = value;
                            return;
                        }

                        if (!inputElements.includes(node.tagName.toLowerCase())) {
                            node.innerHTML = value;
                            return;
                        }

                        if (['checkbox', 'radio'].includes(node.type)
                            && node.value === value
                        ) {
                            node.checked = true;
                            return;
                        }

                        node.value = value;
                    });

                    if (inputElements.includes(node.tagName.toLowerCase())) {
                        node.addEventListener('change', () => {
                            writeGraph(this.#data, bind, node.value);
                            this.#notify(bind);
                        });
                    }
                });
            },
        }

        traverseNodes(doc, handler);
    };

    /**
     * Deals with data-on and data-once attributes
     * @param {DocumentFragment} doc
     */
    bindEvents(doc) {
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
                            return e;
                        }

                        return readGraph(this.#data, path);
                    });
                }

                const call = this.owner[method];
                if (typeof call !== 'function') {
                    return;
                }

                call.apply(this.owner, args);
            }, { once });
        };

        const handler = {
            element: /** @type {HTMLElement} */node => {
                Object.entries(node.attributes).forEach(([name, value]) => {
                    if (!['data-on', 'data-once'].includes(name)) {
                        return;
                    }

                    const once = name === 'data-once';
                    handleEvent(node, value, once);
                });
            },
        };

        traverseNodes(doc, handler);
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
        this.dispatchEvent(event);

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
    (doc.childNodes ?? []).forEach(node => {
        let replacement = null;

        switch (node.nodeType) {
            case Node.ELEMENT_NODE:
                replacement = handler.element && handler.element(node);
                break;
            case Node.ATTRIBUTE_NODE:
                replacement = handler.attribute && handler.attribute(node);
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

            replacement.forEach(newNode => {
                doc.insertBefore(newNode, node);
            });

            doc.removeChild(node);
            return;
        }

        traverseNodes(node, handler);
    });
}

function evenOddFlatBrackets(text, open, close) {
    const openCount = (text.match(new RegExp(open, 'g')) || []).length;
    const closeCount = (text.match(new RegExp(close, 'g')) || []).length;

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
