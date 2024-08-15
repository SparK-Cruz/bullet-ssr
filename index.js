export * from "./lib/index.js";

(async () => {
    // NO BROWSERS ALLOWED
    if (typeof window !== 'undefined') return;

    const esbuild = await import(String('esbuild'));
    const fs = await import(String('node:fs/promises'));

    const output = 'bullet-ssr.js';
    const entry = {
        contents: `export * from "./node_modules/bullet-ssr/lib/index.js";`,
        resolveDir: '.',
    };

    let outContent = null;
    try {
        outContent = await fs.readFile(output, 'utf-8');
    } catch {}

    const tempResult = await esbuild.build({
        stdin: entry,
        format: 'esm',
        bundle: true,
        outfile: 'bundler.tmp',
        write: false,
    });
    const { contents: inputContent, hash } = tempResult.outputFiles[0];

    if (!inputContent) return;

    const banner = `//{{BULLET-SSR:${hash}}}`;
    const same = outContent && outContent.includes(banner);

    if (same) return;

    await esbuild.build({
        stdin: entry,
        banner: {
            js: banner,
        },
        format: 'esm',
        bundle: true,
        outfile: output,
    });
});
