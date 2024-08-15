import fs from "node:fs/promises";
import * as http from "node:http";

import { getRouter } from "./app.js";
import path from "node:path";


const USE_SSR = true;

const router = getRouter(process.cwd());

http.createServer(async (req, res) => {
    if (req.method.toLowerCase() === 'options') {
        res.end();
        return;
    }

    const pathname = req.url;

    let relative = 'client.html';
    let status = 404;
    let content = null;
    let type = 'text/html';

    if (USE_SSR) {
        relative = path.relative(path.resolve('.'), './' + pathname);
        ({status, content, type} = await router.go(relative));
    }

    if (status === 404) {
        try {
            const fileContent = await fs.readFile(relative);

            let contentType = 'text/html';

            if (relative.endsWith('.js')) {
                contentType = 'text/javascript';
            }

            res.appendHeader('Content-Type', contentType);

            res.statusCode = 200;
            res.end(fileContent);
            return;
        } catch {
            console.log('File:', relative, 404);
        }
    }

    res.appendHeader('Content-Type', type);
    res.statusCode = status;
    res.end(content, "utf-8");
}).listen(31911);
console.log('Listening on http://localhost:31911/');
