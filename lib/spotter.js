const IN_PLACE_ARRAY_METHODS = [];

const TARGET = Symbol('SPOTTER_PROXY_TARGET_TRAP');

export default function spotter(obj) {
    const dispatcher = new EventTarget();

    /**
     * @param {string[]} stack
     * @param {any} sub
     * @param {boolean} [bubble]
     * @param {boolean} [cascade]
     */
    const notify = (stack, sub, bubble = true, cascade = true) => {
        const name = stack.length > 0
            ? `update:${stack.join('.')}`
            : 'update';

        const event = new Event(`update:${stack.join('.')}`);
        event.value = sub;

        const generalEvent = new Event(`update:*`);
        generalEvent.key = stack;
        generalEvent.value = sub;

        dispatcher.dispatchEvent(event);
        dispatcher.dispatchEvent(generalEvent);

        if (bubble
            && stack.length
        ) {
            notify(stack.slice(0, -1), null, true, false);
        }

        if (cascade
            && typeof sub === 'object'
            && sub !== null
        ) {
            Object.entries(sub).forEach(([key, value]) => {
                notify([...stack, key], value, false, true);
            });
        }
    };

    const makeProxy = (stack, sub, bubble = true, cascade = true) => {
        return new Proxy(sub, {
            get(target, prop) {
                if (prop === TARGET) {
                    return target;
                }

                if (prop === '_noBubbling') {
                    return makeProxy(stack, target, false, cascade);
                }

                if (prop === '_noCascading') {
                    return makeProxy(stack, target, bubble, false);
                }

                if (prop === 'addEventListener'
                    || prop === 'dispatchEvent'
                ) {
                    return dispatcher[prop].bind(dispatcher);
                }

                if (typeof target[prop] === 'object'
                    && target[prop] !== null
                ) {
                    return makeProxy([...stack, prop], target[prop]);
                }

                if (Array.isArray(target)
                    && typeof target[prop] === 'function'
                    && IN_PLACE_ARRAY_METHODS.includes(prop)
                ) {
                    return (...args) => {
                        const result = target[prop](...args);
                        notify(stack, target);
                        return result;
                    };
                }

                return target[prop];
            },
            set(target, prop, value) {
                target[prop] = (value && value[TARGET]) ?? value;
                notify([...stack, prop], value, bubble, cascade);
                return true;
            }
        });
    };

    return makeProxy([], obj);
}
