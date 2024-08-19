import { frag, html } from "bullet-ssr";

const xhtml = html`
    <template>
        <a href="/">home</a>
        <p>This project could've been developed by {{authorPre}} {{author}}</p>
        <p>Groceries:</p>
        <ul>
            <li data-loop="groceries:item" data-index="i">
                <span>{{item.name}}: {{item.amount}}</span> <span data-if="item.evil">😈</span> <a href="javascript:;" data-on="click:removeItem({{i}})">Remove</a>
            </li>
        </ul>
        <input type="number" data-bind="groceries.1.amount" />
        <form>
            <label>Item:<input data-bind="item.name" type="text" /></label>
            <label>Amount:<input data-bind="item.amount" type="number" step="1" /></label>
            <button data-on="click:addItem(this, item)">Add</button>
            <button data-on="click:oneOfEach">Whereless update simulator</button>
        </form>
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
    {name: "pizza", amount: 5},
];

export default await frag('sample-about', xhtml, {
    data: {
        index: -1,
        author: 'Nemo',
        authorPre: 'a',
        groceries,
        item: {
            name: '',
            amount: 0,
            evil: false,
        },
    },
    constructor() {
        setInterval(this.updateName.bind(this), 700);

        this.addEventListener('update:groceries', () => {
            this.data.groceries.forEach(item => {
                // beware input types
                item.evil = item.amount === 666;
            });
        });
    },
    updateName() {
        this.data.index = (this.data.index + 1) % nameList.length;
        this.data.author = nameList[this.data.index];
        this.data.authorPre = 'AEIOU'
            .includes(this.data.author[0])
            ? 'an'
            : 'a';
    },
    addItem(element, data) {
        this.data.groceries.push(data);
        this.data.item = {name: '', amount: 0, evil: false };
        element.parentElement.querySelector('label:first-child input').focus();
    },
    removeItem(index) {
        this.data.groceries.splice(index, 1);
    },
    oneOfEach() {
        this.data.groceries.fill({name: 'blame the intern', amount: 1});
    }
});
