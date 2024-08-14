import fs from "node:fs/promises";
import * as http from "node:http";

import { getRouter } from "./app.js";
import path from "node:path";

http.createServer(async (req, res) => {
    if (req.method === 'head') {
        res.end();
        return;
    }

    const pathname = req.url;
    let relative = path.relative(path.resolve('.'), './' + pathname);

    const {status, content} = await getRouter(process.cwd()).go(relative);
    // const status = 404;
    // relative ||= 'client.html';

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

    res.statusCode = status;
    res.end(content, "utf-8");
}).listen(31911);
console.log('Listening on http://localhost:31911/');
