import { frag, html } from "bullet-ssr";

const xhtml = html`
    <template>
        <p>I can see the value of {{default}}!</p>
        <p>I have an internal counter: {{counter}}</p>
        <button data-on="click:tellThem"><slot></slot></button>
    </template>
`;

export default await frag('sample-nemo', xhtml, {
    data: () => ({
        default: 'nemo',
        counter: 0,
    }),
    tellThem() {
        console.log("telling...");
        const event = new Event('nemo-click');
        this.dispatchEvent(event);
        this.data.counter++;
    }
});
