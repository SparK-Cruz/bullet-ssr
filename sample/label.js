import { frag, html } from 'bullet-ssr';

const xhtml = html`
    <template>
        {{label}}
    </template>
`;

export default await frag('sample-label', xhtml, {
    constructor() {
        this.data.label = this.route.params.label;
    }
});
