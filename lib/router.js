import { document, Document, fetchFile } from "./window.js";
import Template from "./template.js";

/**
 * @typedef {Object} MapNode
 * @prop {(string|RegExp)} path
 * @prop {(string|HTMLElement|null)} component
 * @prop {(Object.<string,(string|HTMLElement)>|null)} slots
 * @prop {(MapNode[]|null)} children
 * @prop {(string|null)} template
 * @prop {(string|null)} mountPointId
 */

/**
 * Component Router
 */
export default class Router {
    #root = '';

    /**
     * @type {{pattern: string, route: Route, params: (any|null)}[]}
     */
    #routes = [];

    /**
     * @param {MapNode[]} map
     * @param {string} root
     */
    constructor(map, root = '') {
        this.#root = root;

        map.forEach(node => {
            this.#computeRoute(node);
        });
    }

    /**
     * @param {MapNode} node
     * @param {MapNode[]} ancestors
     */
    #computeRoute(node, ancestors = []) {
        const pile = [];
        const segments = [];

        [...ancestors, node].forEach((segment, _, stack) => {
            const { path, component, slots, children } = segment;
            segments.push(path.replace(/^\/?(.*)\/?$/, '$1'));
            pile.push({component, slots: slots ?? []});

            if (component || slots.length) {
                const pattern = segments.join('/');
                this.#routes.push({
                    pattern,
                    route: new Route([...pile], this.#root),
                });
            }

            children.forEach(child => {
                this.#computeRoute(child, stack);
            });
        });
    }

    match(url) {
        return this.#routes.find(info => {
            const matched = RegExp(info.pattern).exec(url);
            if (!matched) return false;

            const { groups: params } = matched;
            info.params = params;

            return true;
        });
    }
}

class Route {
    #pile = [];
    #cache = null;

    constructor(pile, root = '') {
        this.#pile = pile;
        this.#cache = new Cache(root);
    }

    /**
     * @param {function(count: number, total: number)} progressCallback
     */
    async preload(progressCallback = (count, total) => {}) {
        const total = this.#pile.reduce((prev, step) => prev + (step.component ? 1 : 0) + step.slots.length, 0);
        let count = 0;

        const load = async (file) => {
            const result = await this.#cache.load(file);
            progressCallback(count, total);
            return result;
        };

        this.#pile.forEach(async step => {
            return await Promise.all([
                step.component = await load(step.component),
                step.slots = Object.fromEntries(await Promise.all(
                    Object.entries(step.slots).map(async ([slot, component]) => {
                        return [slot, await load(component)];
                    }),
                )),
            ]);
        });
    }

    async mount() {
        const templateFile = this.#pile.reverse().find(step => step.template).template;
        const mountPoint = document.getElementById(templateTip.mountPointId ?? 'app-root');

        const fileContent = await fetchFile(templateFile);
        const templateContent = Document.parseHTMLUnsafe(fileContent);

        const template = new Template(templateContent);
        document.documentElement.innerHTML = template.toString();

        this.#pile.reduce(async (prev, step) => {
            prev = await prev;

            if (null === prev) {
                prev = mountPoint;
            }

            step.component = await load(step.component);
            const frag = new step.component();

            step.slots = Object.fromEntries(await Promise.all(
                Object.entries(step.slots).map(async ([slot, component]) => {
                    const slotComponent = await load(component);
                    const slotFrag = new slotComponent();
                    slotFrag.setAttribute('slot', slot);
                    frag.appendChild(slotFrag);
                    return [slot, slotComponent];
                }),
            ));

            prev.appendChild(frag);

            return frag;
        }, null);
    }
}

class Cache {
    /**
     * @type {Object.<string, Cache>}
     */
    static #roots = {};

    /**
     * @type {Object.<string, HTMLElement>}
     */
    #cached = {};

    #root = '';

    constructor(root = '') {
        this.#root = root;
        return Cache.#roots[root] ??= this;
    }

    async load(file) {
        if (typeof file !== 'string') {
            return file;
        }
        return this.#cached[file] ??= (await import(`${this.#root}/${file}`)).default;
    }
}
