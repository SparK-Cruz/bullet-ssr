import { frag } from "./lib/index.js";

const xhtml = `
    <template>
        <p>This project could've been developed by a {{author}}</p>
        <p>Groceries:</p>
        <ul>
            <li data-loop="groceries:item">
                {{item.name}}: {{item.amount}}
            </li>
        </ul>
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

const groceries = [
    {name: "apple", amount: 15},
    {name: "banana", amount: 30},
    {name: "cashew", amount: 5},
];

export default await frag('sample-about', xhtml, {
    data: {
        index: -1,
        author: 'Nemo',
        groceries,
    },
    constructor() {
        window.data = this.data;
        setInterval(this.updateName.bind(this), 300);
    },
    updateName() {
        this.data.index = (this.data.index + 1) % nameList.length;
        this.data.author = nameList[this.data.index];
    }
});
