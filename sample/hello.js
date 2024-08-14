import { frag, window } from "./lib/index.js";

const xhtml = `
    <template>
        Hello World! {{name}}
        <input type="text" data-bind="name" />
        <input type="text" placeholder="{{name}}" />
        <button data-on="click:callMe">Click Me!</button>
    </template>
`;

export default await frag('sample-hello', xhtml, {
    async data() {
        const obj = {
            name: "foo"
        };

        window.data = obj;
        return obj;
    },
    callMe(e) {
        console.log("Hello was clicked!");
    },
    constructor() {
        // this.shadow.querySelector('button').click();
    }
});
