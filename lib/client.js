// Just a passer of window stuff to mirror server-side polyfills
// so we pretend these aren't globals for the client-side

export const customElements = window.customElements;

export const Document = window.Document;

export const document = window.document;

export class HTMLElement extends window.HTMLElement {
    window = window;
    document = window.document;
}
