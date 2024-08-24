import { frag, html } from "bullet-ssr";

const xhtml = html`
    <template>
        <p>This project could've been developed by {{authorPre}} {{author}}</p>
    </template>
`;

const nameList = [
    "Adam",
    "Andy",
    "Chris",
    "Colin",
    "Dennis",
    "Doug",
    "Duffy",
    "Gary",
    "Grant",
    "Greg",
    "Ian",
    "Jerry",
    "Jon",
    "Keith",
    "Mark",
    "Matt",
    "Mike",
    "Nate",
    "Paul",
    "Scott",
    "Steve",
    "Tom",
    "Yahn",
];

export default await frag('sample-about', xhtml, {
    data: {
        index: -1,
        author: 'Nemo',
        authorPre: 'a',
    },
    constructor() {
        setInterval(this.updateName.bind(this), 700);
    },
    updateName() {
        this.data.index = (this.data.index + 1) % nameList.length;
        this.data.author = nameList[this.data.index];
        this.data.authorPre = 'AEIOU'
            .includes(this.data.author[0])
            ? 'an'
            : 'a';
    },
});
