import { frag, window } from "./lib/index.js";

const xhtml = `
    <template>
        Hello World! {{name}}
        <input type="text" data-bind="name" />
        <input type="text" placeholder="This: {{name}} updates too" />
        <button data-on="click:callMe">Click Me!</button>
        <a href="/about">A link to somewhere</a>
    </template>
`;

export default await frag('sample-hello', xhtml, {
    data: async () => ({
        name: "foo"
    }),
    callMe(e) {
        console.log("Hello was clicked!", this.data.name);

        this.data.name = 'nemo';
    },
    constructor() {
        window.data = this.data;
        // this.shadow.querySelector('button').click();
    }
});
