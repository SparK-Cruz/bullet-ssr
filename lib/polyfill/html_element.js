export default function EnhanceHTMLElement(window) {
    const staticDocument = window.document;
    const createElement = staticDocument.createElement.bind(staticDocument);

    return class HTMLElement extends window.HTMLElement {
        window = window;
        document = staticDocument;

        #shadowRoot = null;

        get shadowRoot() {
            return this.#shadowRoot;
        }

        attachShadow(options) {
            const defaults = {
                mode: 'closed',
                clonable: false,
                delegatesFocus: false,
                serializable: false,
            }
            options = Object.assign({}, defaults, options);

            // mimick shadow as an element
            // don't forget to replace these with templates after serialization
            const template = createElement('bullet-shadow-root-ssr');

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

            this.prepend(template);

            if (options.mode === 'open') {
                this.#shadowRoot = template;
            }

            return template;
        }
    }
};
