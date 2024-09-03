import { JSDOM } from "jsdom";
// LET'S POLYFILL THE SHIT OUT OF JSDOM
// SO IT IS ACTUALLY USEFUL FOR SSR

import EnhanceCustomElementRegistryInstance from "./polyfill/custom_elements.js";
import EnhanceDocument from "./polyfill/document.js";
import EnhanceHTMLElement from "./polyfill/html_element.js";

// For some reason class and singleton definitions
// don't exist without an instance because
// they are all "generated"
const {
    customElements,
    Document,
    document,
    HTMLElement,
} = (() => {
    const staticDom = new JSDOM();
    const { window: staticWindow } = staticDom;
    const { customElements, document } = staticWindow;

    return {
        customElements: EnhanceCustomElementRegistryInstance(customElements),
        Document: EnhanceDocument(staticWindow),
        document,
        HTMLElement: EnhanceHTMLElement(staticWindow),
    };
})();

export default class DOM {
    constructor(html = null) {
        html ??= '';
        const document = Document.parseHTMLUnsafe(html);
        return new Proxy(document.__server__.dom, {
            get(target, prop) {
                if (prop === 'serialize') {
                    const serialize = document.__server__.serialize.bind(target);
                    return async () => {
                        // Once for the structure
                        serialize();

                        // Await for all frags to init
                        await Promise.all(Object.keys(customElements.custom).map(c => {
                            return [...document.querySelectorAll(c)].map(e => {
                                return e.whenInit && e.whenInit();
                            });
                        }).flat());

                        // Twice, now with upgraded custom tags
                        return serialize();
                    };
                }

                return target[prop];
            }
        });
    }
}

export {
    customElements,
    Document,
    document,
    HTMLElement,
}
