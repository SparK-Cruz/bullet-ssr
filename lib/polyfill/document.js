import { JSDOM, VirtualConsole } from "jsdom";
import EnhanceCustomElementRegistryInstance from "./custom_elements.js";

// this makes JSDOM shutup about CSS parsing
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', () => {});

export default function EnhanceDocument(window) {
    return class Document extends window.Document {
        static parseHTMLUnsafe(html) {
            const dom = new JSDOM(html, { virtualConsole });
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
