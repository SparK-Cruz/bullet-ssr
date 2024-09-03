import { JSDOM } from "jsdom";
import EnhanceCustomElementRegistryInstance from "./custom_elements.js";

export default function EnhanceDocument(window) {
    return class Document extends window.Document {
        static parseHTMLUnsafe(html) {
            const dom = new JSDOM(html);
            const customElements = EnhanceCustomElementRegistryInstance(dom.window.customElements);
            const result = dom.window.document;

            result.__server__ = {
                dom: dom,
                serialize: () => {
                    customElements.__server__.inject(dom.window);
                    customElements.upgrade(result.body);
                    return dom.serialize().replace(/bullet-shadow-root-ssr/g, 'template');
                }
            };
            return result;
        }
    }
};
