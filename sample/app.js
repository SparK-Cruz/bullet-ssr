import { Router } from "./lib/index.js";

export function getRouter(root) {
    return new Router([
        {
            path: '/',
            component: 'hello.js',
            template: 'app.html',
        }
    ], root ?? '');
}
