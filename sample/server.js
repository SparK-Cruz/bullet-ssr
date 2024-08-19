import fs from "node:fs/promises";
import * as http from "node:http";

import { getRouter } from "./app.js";


const USE_SSR = process.env.USE_SSR != 'false';

const router = getRouter(process.cwd());

async function handleStatic(url, res) {
    let fileContent = null;
    const pathname = url.replace(/^\/?(.*)\/?$/, '$1');

    try {
        fileContent = await fs.readFile(pathname, "utf-8");
    } catch {
        return false;
    }

    const ext = pathname.split('.').pop();
    const contentType = {
        'html': 'text/html',
        'js': 'text/javascript',
    }[ext];

    res.appendHeader('Content-Type', contentType);
    res.statusCode = 200;
    res.end(fileContent);

    return true;
}

http.createServer(async (req, res) => {
    if (req.method.toLowerCase() === 'options') {
        res.end();
        return;
    }

    if (await handleStatic(req.url, res)) {
        return;
    }

    if (!USE_SSR && req.url !== '/bullet-ssr-bundle') {
        handleStatic('client.html', res);
        return;
    }

    await router.go(req.url, res);
}).listen(31911);
console.log('Listening on http://localhost:31911/');
