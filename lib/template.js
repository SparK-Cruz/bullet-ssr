import { getDom, customElements } from "./window.js";
const window = getDom().window;
const Node = window.Node;
const document = window.document;

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
    #data = {};
    #hasInit = false;

    get content() {
        return this.#parsed;
    }

    get attributes() {
        return this.#original.cloneNode(true).attributes;
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

    init(initialData, doc) {
        if (this.#hasInit) return doc;

        this.#data = initialData;

        doc ??= this.#parsed;

        // this.bindDataLoops(doc);
        this.bindAndReplaceDataTags(doc);
        this.bindDataBindAttributes(doc);
        this.bindEvents(doc);

        this.#hasInit = true;

        return doc;
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
                const [value, bind] = evenOddFlatBrackets(node.value, '{{', '}}');

                if (value.trim().length > 0) {
                    return;
                }

                if (bind.trim().length === 0) {
                    throw new Error(`Empty bind tag in attribute ${node.name}`);
                }

                this.#brain.addEventListener(`update:${bind}`, ({value}) => {
                    element.setAttribute(node.name, value);
                });

                element.setAttribute(node.name, readGraph(this.#data, bind));
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
            name: 'bindDataBindAttributes',
            element: /** @type {HTMLElement} */node => {
                Object.values(node.attributes).forEach(({name, value: bind}) => {
                    if (!['data-bind'].includes(name)) {
                        return;
                    }

                    if (bind.trim().length === 0) {
                        throw new Error(`Empty data-bind attribute in element ${node.tagName}`);
                    }

                    const setElementValue = value => {
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

                        // server-side
                        node.setAttribute('value', value);
                    };

                    this.#brain.addEventListener(`update:${bind}`, ({value}) => {
                        setElementValue(value);
                    });

                    if (inputElements.includes(node.tagName.toLowerCase())) {
                        node.addEventListener('change', () => {
                            writeGraph(this.#data, bind, node.value);
                            this.#notify(bind);
                        });
                    }

                    setElementValue(readGraph(this.#data, bind));
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
                let [method, parameters] = evenOddFlatBrackets(action, '\\(', '\\)');
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
            name: 'bindEvents',
            element: /** @type {HTMLElement} */node => {
                Object.values(node.attributes).forEach(({name, value: bind}) => {
                    if (!['data-on', 'data-once'].includes(name)) {
                        return;
                    }

                    const once = name === 'data-once';
                    handleEvent(node, bind, once);
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
