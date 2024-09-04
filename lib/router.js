import { Document, isServer, fetchFile } from "./window.js";
import { initAll } from "./frag.js";

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
                route: new StaticRoute(
                    'Bundle',
                    200,
                    async () => {
                        return await (await import(String('./bundler.js'))).content();
                    },
                    'text/javascript',
                ),
            });
            return;
        }

        // client-side global window
        window.addEventListener('popstate', e => {
            console.log('Navigating to:', window.location.href, '(popstate)');
            window.document.documentElement.innerHTML = '';
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
                slots: slots ?? {},
                template,
                mountPointId
            });
        });

        const { name, component, slots, children } = node;

        if (component || Object.keys(slots).length) {
            const pattern = segments.filter(s => s).join('/');
            this.#routes.push({
                pattern,
                route: new Route(name, this, [...pile], this.#root),
            });
        }

        (children ?? []).forEach(child => {
            this.#computeRoute(child, stack);
        });
    }

    match(url) {
        url = url.trim().replace(/^\/?(.*[^\/])\/?$/, '$1');
        if (url === '/') {
            url = '';
        }

        return (this.#routes.find(info => {
            const matched = RegExp(`^${info.pattern}$`).exec(url);

            if (!matched) return false;

            const { groups: params } = matched;
            info.route.params = params;
            info.route.url = url;

            return true;
        })
        ?? {
            route: new StaticRoute(
                'Not Found',
                404,
                'Not Found',
                'text/plain',
            ),
        }).route;
    }

    async go(url, res = null) {
        if (url !== '/'
            && url.endsWith('/')
        ) {
            res.writeHead(302, {
                'Location': url.replace(/^(.*)\/$/, '$1')
            });
            res.end();
            return;
        }

        const route = this.match(url);
        if (res) {
            return await route.render(res);
        }
        return await route.mount();
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
    name = null;
    params = {};
    url = null;
    #router = null;
    #pile = [];
    #cache = null;

    get isStatic() {
        return false;
    }

    get router() {
        return this.#router;
    }

    get pile() {
        return this.#pile.map(step => Object.assign({}, step));
    }

    constructor(name, router, pile, root = '') {
        this.name = name;
        this.#router = router;
        this.#pile = pile;
        this.#cache = new Cache(root);
    }

    /**
     * @param {function(count: number, total: number)} progressCallback
     */
    async preload(progressCallback = (count, total) => {}) {
        const total = this.#pile.reduce((prev, step) => {
            return prev + (step.component ? 1 : 0) + (Object.values(step.slots ?? {}) ?? []).length;
        }, 0);
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
        const templateTip = this.#pile.slice().reverse().find(step => step.template);
        let fileContent = `<!DOCTYPE html><html id="app-root"></html>`;
        let mountPointId = 'app-root';

        if (templateTip) {
            mountPointId = templateTip.mountPointId ?? 'app-root';

            try {
                fileContent = (await fetchFile(templateTip.template));
            } catch {};
        }

        const document = isServer ? Document.parseHTMLUnsafe(fileContent) : window.document;
        const templateContent = Document.parseHTMLUnsafe(fileContent);

        const importmapContent = {imports: { 'bullet-ssr': '/bullet-ssr-bundle' }}
        const importmap = document.createElement("script");
        importmap.setAttribute('type', 'importmap');
        importmap.textContent = JSON.stringify(importmapContent);

        let mountPoint = null;

        // Must set this before preload
        if (!isServer) {
            window.route = this;
        }

        await this.preload((count, total) => {
            !isServer && console.log('[Bullet] Loading frag', count, 'of', total);
        });

        if (!isServer && document.getElementById(mountPointId)) {
            console.log("[Bullet] Hydrating SSR!");
            return {status: 200, content: '', type: 'text/html'};
        }

        document.documentElement.innerHTML = templateContent.documentElement.innerHTML;
        const placeholder = document.createComment("loading...");
        mountPoint = document.getElementById(mountPointId);
        const mountParent = mountPoint.parentNode;
        mountParent.replaceChild(placeholder, mountPoint);

        if (isServer) {
            document.head.prepend(importmap);
        }

        let title = document.title;

        await this.#pile.reduce(async (prev, step) => {
            prev = await prev;

            let frag = null;

            if (step.component) {
                step.component = await this.#cache.load(step.component);
                frag = new step.component({route: this});
                Object.assign(frag.data, prev.data);
                await frag.whenInit();
                title = frag.pageTitle || title;
            }

            const slotHost = frag ?? prev;

            step.slots = Object.fromEntries(await Promise.all(
                Object.entries(step.slots).map(async ([slot, component]) => {
                    const slotComponent = await this.#cache.load(component);
                    const slotFrag = new slotComponent({route: this});
                    Object.assign(slotFrag.data, slotHost.data);

                    await slotFrag.whenInit();
                    slotFrag.setAttribute('slot', slot);
                    slotHost.appendChild(slotFrag);

                    title = slotFrag.pageTitle || title;
                    return [slot, slotComponent];
                }),
            ));

            if (frag) {
                prev.appendChild(frag);
                return frag;
            }

            return prev;
        }, mountPoint);

        if (isServer) {
            const titleElement = document.querySelector('title');
            titleElement && (titleElement.textContent = title);
        } else {
            document.title = title;
        }

        await initAll();
        mountParent.replaceChild(mountPoint, placeholder);

        if (!isServer) {
            console.log("[Bullet] Cold start!");
            return;
        }

        return {status: 200, content: document.__server__.serialize(), type: 'text/html'};
    }

    /**
     * @param {Response} res
     */
    async render(res) {
        const {status, content, type} = await this.mount();

        res.statusCode = status;
        res.appendHeader('Content-Type', type);
        res.end(content, "utf-8");
    }
}

class StaticRoute extends Route {
    content = null;
    type = null;

    get isStatic() {
        return true;
    }

    constructor(name, status, content, type) {
        super(name, null, []);

        this.status = status;
        this.content = content;
        this.type = type;
    }

    async mount() {
        let content = this.content;
        if (typeof content === 'function') {
            content = await content();
        }

        return {
            status: this.status,
            content: content,
            type: this.type,
        };
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
