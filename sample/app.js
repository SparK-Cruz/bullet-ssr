import { Router } from "bullet-ssr";

export function getRouter(root) {
    return new Router([
        {
            path: '/',
            component: 'hello.js',
            template: 'app.html',
            children: [
                {
                    path:'label/(?<label>.*)',
                    component: 'label.js',
                }
            ]
        },
        {
            path: '/about',
            component: 'about.js',
            template: 'app.html',
        }
    ], root ?? '');
}
