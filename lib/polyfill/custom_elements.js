import EnhanceDocument from "./document.js";
import EnhanceHTMLElement from "./html_element.js";

/* FEED THE EVAL { */
import { default as TemplateClass } from "../template.js";
import { default as spotterFunction } from "../spotter.js";
/* } */

class CustomElementRegistry {
    static #instance = null;

    custom = {};
    internal = null;

    // singleton
    constructor(originalRegistry) {
        if (CustomElementRegistry.#instance) {
            return CustomElementRegistry.#instance;
        }

        this.internal = originalRegistry;

        CustomElementRegistry.#instance = this;
    }

    __server__ = {
        inject: this.#inject.bind(this)
    };

    define(tagName, elementConstructor) {
        tagName = tagName.toLowerCase();
        this.custom[tagName] = elementConstructor;
        this.internal.define(tagName, elementConstructor);
    }

    get(tagName) {
        return this.custom[tagName?.toLowerCase()];
    }

    getName(constructor) {
        return Object.keys(this.custom)[Object.values(this.custom).indexOf(constructor)];
    }

    upgrade(root, rootWindow = null) {
        const window = rootWindow ?? root.window;

        const isCustom = this.get(root.tagName) !== null;

        (window?.customElements ?? this.internal).upgrade(root);

        root.childNodes.forEach(node => {
            this.upgrade(node, window);
        });
        root.shadowRoot?.childNodes.forEach(node => {
            this.upgrade(node, window);
        });

        if (isCustom && !root.upgraded) {
            root.upgraded = true;
            // twice because we have children injected
            // by the custom component constructor (ie: ShadowRoot)
            this.upgrade(root);
        }
    }

    #inject(docWindow) {
        Object.keys(this.custom).forEach(key => {
            if (docWindow.customElements.get(key)) {
                // Already defined for this docWindow
                return;
            }

            /* FEED THE EVAL { */
            const Document = EnhanceDocument(docWindow);
            const HTMLElement = EnhanceHTMLElement(docWindow);
            const external = this.custom[key].external ?? {};
            const Template = TemplateClass;
            const spotter = spotterFunction;
            const isServer = true;
            /* } */

            const localDefinition = eval(`(${this.custom[key].toString()})`);
            docWindow.customElements.define(key, localDefinition);
        });
    }
}

export default function EnhanceCustomElementRegistryInstance(customElements) {
    return new CustomElementRegistry(customElements);
}
