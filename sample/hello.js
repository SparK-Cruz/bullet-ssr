import { frag, html } from "bullet-ssr";

// don't forget to import your components
import "./nemo.js";

const xhtml = html`
    <template>
        <span>Hello World! {{name}}</span>
        <input type="text" data-bind="name" />
        <input type="text" placeholder="This: {{name}} updates too" />
        <sample-nemo data-on="nemo-click:callMe" data-bind="name"><slot>Where's nemo?</slot></sample-nemo>
        <a href="/about">A link to somewhere</a>
    </template>
`;


export default await frag('sample-hello', xhtml, {
    data: async () => ({
        name: "foo"
    }),
    callMe(e) {
        console.log("Nemo was clicked! Value was:", this.data.name);

        this.data.name = 'nemo';
    },
    constructor() {
    }
});
