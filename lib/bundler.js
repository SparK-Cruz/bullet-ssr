export async function content() {
    // SERVER-SIDE ONLY
    if (typeof window !== 'undefined') return;

    const entry = {
        contents: `export * from "./node_modules/bullet-ssr/lib/index.js";`,
        resolveDir: '.',
    };

    const esbuild = await import(String('esbuild'));
    const tempResult = await esbuild.build({
        stdin: entry,
        format: 'esm',
        bundle: true,
        banner: {
            js: '//{{BULLET-SSR-BUNDLE}}'
        },
        outfile: 'bundler.tmp',
        write: false,
    });
    return new TextDecoder('utf8').decode(tempResult.outputFiles[0].contents);
}
