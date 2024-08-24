import { html, frag } from "bullet-ssr";

const xhtml = html`
    <template>
        <p>Groceries:</p>
        <ul>
            <li data-loop="groceries" data-index="i">
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

export default await frag('sample-groceries', xhtml, {
    data: () => ({
        groceries: [
            {name: "apple", amount: 15},
            {name: "banana", amount: 30},
            {name: "pizza", amount: 5},
        ],
        item: {
            name: '',
            amount: 0,
            evil: false,
        },
    }),
    constructor() {
        this.addEventListener('update:groceries', () => {
            this.data.groceries.forEach(item => {
                // beware input types
                item.evil = item.amount === 666;
            });
        });
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
        // adding the same item twice to the list (same reference) has side-effects
        // so we assign the values individually
        this.data.groceries.forEach(item => {
            Object.assign(item, {name: 'blame the intern', amount: 1, evil: false});
        });
    }
});
