const isServer = typeof window === 'undefined';

const JSDOM = await (async () => {
    if (!isServer) return null;
    return (await import(String("jsdom"))).JSDOM;
})();

const customElements = (() => {
    if (!isServer) return window.customElements;

    const _names = [];
    const _dummy = (new JSDOM().window).customElements;
    const _windows = [{customElements: _dummy}];

    return new Proxy(
        {
            addWindow(window) {
                _windows.push(window);

                _names.forEach(name => {
                    const constructor = _dummy.get(name);
                    (window.customElements.get(name)
                    || window.customElements.define(name, constructor));
                });
            }
        },
        {
            get(target, prop) {
                if (typeof target[prop] !== 'undefined') {
                    return target[prop];
                }

                if (prop === 'define') {
                    return (name, constructor) => {
                        if (!_dummy.get(name)) {
                            _windows.forEach(window => {
                                window.customElements.define(name, constructor);
                            });
                            _names.push(name);
                        }
                    };
                }

                if (typeof _dummy[prop] === 'function') {
                    return _dummy[prop].bind(_dummy);
                }

                return _dummy[prop];
            }
        }
    );
})();

const getDom = () => {
    if (!isServer) return {window};

    const dom = new JSDOM('<!doctype html><html><body></body></html>');

    const originalAttachShadow = dom.window.Element.prototype.attachShadow;
    dom.window.Element.prototype.attachShadow = function (options) {
        const defaults = {
            mode: 'closed',
            clonable: false,
            delegatesFocus: false,
            serializable: false,
        }
        options = Object.assign({}, defaults, options);

        const template = dom.window.document.createElement('template');
        template.setAttribute('shadowrootmode', options.mode);

        if (options.clonable) {
            template.setAttribute('shadowrootclonable', '');
        }
        if (options.delegatesFocus) {
            template.setAttribute('shadowrootdelegatesfocus', '');
        }
        if (options.serializable) {
            template.setAttribute('shadowrootserializable', '');
        }

        const contentHolder = dom.window.document.createElement('div');
        const shadow = originalAttachShadow.call(this, options);

        const proxy = new Proxy(template, {
            get(target, prop) {
                if (typeof contentHolder[prop] === 'function') {
                    return (...args) => {
                        try {
                            contentHolder[prop](...args);
                        } catch (e) {
                            console.error(args);
                            throw e;
                        }
                        target.innerHTML = contentHolder.innerHTML;
                        shadow[prop](...args);
                    };
                }

                if (prop === 'childNodes') {
                    try {
                        return contentHolder[prop];
                    } finally {
                        target.innerHTML = contentHolder.innerHTML;
                    }
                }

                return target[prop];
            }
        });

        this.prepend(proxy);

        return proxy;
    }

    customElements.addWindow(dom.window);

    return dom;
};

const getWindow = [
    async () => window,
    async () => {
        const window = getDom().window;
        window.Document.parseHTMLUnsafe = html => {
            const dom = new JSDOM(html);
            return new Proxy(dom.window.document, {
                get(target, prop) {
                    if (prop === 'serialize') {
                        return dom.serialize.bind(dom);
                    }
                    return target[prop];
                }
            });
        };
        return window;
    }
][Number(isServer)];

const {
    Document,
    HTMLElement,
} = await getWindow();

const fetchFile = [
    async url => {
        const request = await fetch(`/${url}`);
        return request.text();
    },
    async url => {
        const fs = (await import(String('node:fs/promises')));
        return await fs.readFile(url, "utf-8");
    },
][Number(isServer)];

const serialize = [
    (doc) => {
        return (new XMLSerializer()).serializeToString(doc);
    },
    (doc) => {
        return doc.serialize();
    },
][Number(isServer)];

const blankShim = new Proxy({}, {
    get(target, prop, proxy) {
        return proxy;
    }
});

export {
    Document,
    HTMLElement,
    getDom,
    customElements,
    fetchFile,
    serialize,
    isServer,
}

export default await getWindow();
