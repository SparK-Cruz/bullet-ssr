import { JSDOM } from 'jsdom';
import frag from './lib/frag.js';
import Router from './lib/router.js';

const dom = new JSDOM();
global.window = dom.window;

export {
    frag,
    Router,
}
