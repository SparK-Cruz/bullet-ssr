import { html, frag } from "bullet-ssr";

const xhtml = html`
    <template>
        <p>Groceries:</p>
        <ul>
            <li data-loop="groceries" data-index="i">
                <span>{{item.name}}: {{item.amount}}</span>
                <span data-if="item.evil">😈</span>
                <a href="javascript:;" data-on="click:removeItem({{i}})">Remove</a>
            </li>
        </ul>
        <input type="number" data-bind="groceries.1.amount" />
        <form>
            <label>Item:<input id="name" data-bind="item.name" type="text" /></label>
            <label>Amount:<input data-bind="item.amount" type="number" step="1" /></label>
            <button data-on="click:addItem">Add</button>
            <button data-on="click:oneOfEach">Whereless update simulator</button>
        </form>
    </template>
`;

export default await frag('sample-groceries', xhtml, {
    data: () => ({
        groceries: [
            {name: "apple", amount: 15, evil: false},
            {name: "banana", amount: 30, evil: false},
            {name: "pizza", amount: 5, evil: false},
        ],
        item: {
            name: '',
            amount: 0,
            evil: false,
        },
    }),
    constructor() {
        this.addEventListener('update:groceries', () => {
            // Beware infinite loops with lists!
            // You can call "_noBubbling" and "_noCascade"
            // anywhere inside this.data (spotter) structure:
            // this.data._noBubbling.groceries.forEach...
            // this.data.groceries._noBubbling.forEach...
            // Of course it only works on objects/arrays

            this.data.groceries.forEach(item => {
                // beware input types
                item._noBubbling.evil = item.amount === 666;
            });
        });
    },
    addItem() {
        this.data.groceries.push(JSON.parse(JSON.stringify(this.data.item)));
        this.data.item = {name: '', amount: 0, evil: false };
        this.getElementById('name').focus();
    },
    removeItem(index) {
        this.data.groceries.splice(index, 1);
    },
    oneOfEach() {
        // adding the same item twice to the list (same reference) has side-effects
        // so we assign the values individually
        this.data.groceries = Array(this.data.groceries.length).fill(null).map(() => ({
            name: 'blame the intern', amount: 1, evil: false
        }));
    }
});
