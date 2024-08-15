import { Document, getDom, fetchFile, serialize, isServer } from "./window.js";

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

        if (isServer) {
            console.log('AVAILABLE ROUTES:');
            this.#routes.map(r => r.pattern).forEach(p => {
                console.log('GET', `/${p}`);
            });
        }

        if (isServer) {
            this.#routes.push({
                pattern: 'bullet-ssr-bundle',
                route: {mount: async () => ({
                    status: 200,
                    content: await (await import(String('./bundler.js'))).content(),
                    type: 'text/javascript',
                })},
            });
            return;
        }

        window.addEventListener('popstate', e => {
            console.log('Navigating to:', window.location.href, '(popstate)');
            this.go(window.location.pathname);
        });
    }

    /**
     * @param {MapNode} node
     * @param {MapNode[]} ancestors
     */
    #computeRoute(node, ancestors = []) {
        const pile = [];
        const segments = [];

        const stack = [...ancestors, node];
        stack.forEach(segment => {
            const { path, component, slots, template, mountPointId } = segment;
            segments.push(path.replace(/^\/?(.*)\/?$/, '$1'));
            pile.push({
                component,
                slots: slots ?? [],
                template,
                mountPointId
            });
        });

        const { component, slots, children } = node;

        if (component || slots.length) {
            const pattern = segments.filter(s => s).join('/');
            this.#routes.push({
                pattern,
                route: new Route(this, [...pile], this.#root),
            });
        }

        (children ?? []).forEach(child => {
            this.#computeRoute(child, stack);
        });
    }

    match(url) {
        url = url.replace(/^\/?(.*)\/?$/, '$1');

        return (this.#routes.find(info => {
            const matched = RegExp(`^${info.pattern}$`).exec(url);

            if (!matched) return false;

            const { groups: params } = matched;
            info.route.params = params;

            return true;
        })
        ?? {
            route: {
                mount: () => ({
                    status: 404, // farofar
                    content: 'Not Found',
                    type: 'text/plain',
                })
            }
        }).route;
    }

    async go(url) {
        return await this.match(url).mount();
    }

    async navigate(url) {
        if (isServer) return;

        window.history.pushState({}, '', url);
        console.log('Navigating to:', window.location.href);
        window.document.documentElement.innerHTML = '';
        this.go(url);
    }
}

class Route {
    #router = null;
    #pile = [];
    #cache = null;

    get router() {
        return this.#router;
    }

    constructor(router, pile, root = '') {
        this.#router = router;
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
            progressCallback(++count, total);
            return result;
        };

        await Promise.all(this.#pile.map(async step => {
            return await Promise.all([
                step.component = await load(step.component),
                step.slots = Object.fromEntries(await Promise.all(
                    Object.entries(step.slots).map(async ([slot, component]) => {
                        return [slot, await load(component)];
                    }),
                )),
            ]);
        }));
    }

    async mount() {
        const dom = getDom();
        let document = dom.window.document;

        const templateTip = this.#pile.reverse().find(step => step.template);
        const templateFile = templateTip.template;
        const mountPointId = templateTip.mountPointId ?? 'app-root';

        let fileContent = templateFile;
        try {
            fileContent = (await fetchFile(templateFile)) ?? fileContent;
        } catch {};

        document = isServer ? Document.parseHTMLUnsafe(fileContent) : document;
        const templateContent = Document.parseHTMLUnsafe(fileContent);

        const importmapContent = {imports: { 'bullet-ssr': '/bullet-ssr-bundle' }}
        const importmap = document.createElement("script");
        importmap.setAttribute('type', 'importmap');
        importmap.textContent = JSON.stringify(importmapContent);

        dom.window.route = this;

        let mountPoint = null;

        await this.preload((count, total) => {
            !isServer && console.log('[Bullet] Loading frag', count, 'of', total);
        });

        if (document.getElementById(mountPointId) && !isServer) {
            console.log("[Bullet] Hydrating SSR!");
            return {status: 200, content: '', type: 'text/html'};
        }

        document.documentElement.innerHTML = templateContent.documentElement.innerHTML;
        mountPoint = document.getElementById(mountPointId);

        if (isServer) {
            document.head.prepend(importmap);
        }

        await this.#pile.reverse().reduce(async (prev, step) => {
            prev = await prev;

            let frag = null;

            if (step.component) {
                step.component = await this.#cache.load(step.component);
                frag = new step.component(this);
                await frag.whenInit();
            }

            const slotHost = frag ?? prev;
            step.slots = Object.fromEntries(await Promise.all(
                Object.entries(step.slots).map(async ([slot, component]) => {
                    const slotComponent = await this.#cache.load(component);
                    const slotFrag = new slotComponent(this);
                    slotFrag.setAttribute('slot', slot);
                    slotHost.appendChild(slotFrag);
                    return [slot, slotComponent];
                }),
            ));

            if (frag) {
                prev.appendChild(frag);
                return frag;
            }

            return prev;
        }, mountPoint);

        !isServer && console.log("[Bullet] Cold start!");
        return {status: 200, content: serialize(document), type: 'text/html'};
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
        return this.#cached[file] ??= (await import(String(`${this.#root}/${file}`))).default;
    }
}
