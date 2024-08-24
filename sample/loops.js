import { html, frag } from "bullet-ssr";

const xhtml = html`
    <template>
        <h1>{{volumes.0.title}}</h1>
        <ol>
            <li data-loop="volumes.0.parts:part">
                {{part.title}}
                <ol>
                    <li data-loop="part.chapters:chapter">
                        {{chapter}}
                    </li>
                </ol>
            </li>
        </ol>
    </template>
`;

export default await frag('sample-loops', xhtml, {
    data: () => ({
        // initializing in arrow doesn't allow you to access `this`
        volumes: [
            {
                title: "The Hitchhiker's Guide to the Galaxy",
                parts: [
                    {
                        title: "The End of the World",
                        chapters: [
                            "Ford's First Law",
                            "The Vogons",
                            "The Earth",
                            "The Bypass",
                            "The Rescue",
                            "The Infinite Improbability Drive",
                        ],
                    },
                    {
                        title: "The Heart of Gold",
                        chapters: [
                            "The President's Party",
                            "The Heart of Gold",
                            "The Babel Fish",
                            "The Restaurant at the End of the Universe",
                            "The Magratheans",
                            "The Ultimate Answer",
                        ],
                    },
                    {
                        title: "The Search for Earth",
                        chapters: [
                            "The Search Begins",
                            "The Ravenous Bugblatter Beast",
                            "The Earth's Destruction",
                            "The Mice",
                            "The Slartibartfast",
                            "The Deep Thought",
                        ],
                    },
                    {
                        title: "The Quest for the Ultimate Question",
                        chapters: [
                            "The Quest Begins",
                            "The Supercomputer",
                            "The Answer",
                            "The Question",
                            "The Magratheans' Secret",
                        ],
                    },
                    {
                        title: "The Restaurant at the End of the Universe",
                        chapters: [
                            "The Restaurant",
                            "The Prostetnic Vogon Jeltz",
                            "The Earth's Rebirth",
                            "The Random Factor",
                            "The Infinite Improbability Drive",
                        ],
                    },
                    {
                        title: "The Final Confrontation",
                        chapters: [
                            "The Final Confrontation",
                            "The Ultimate Question",
                            "The Answer",
                            "The End of the Universe",
                            "The New Beginning",
                            "The Last Chapter",
                            "The Final Word",
                        ],
                    },
                ]
            }
        ],
    }),
});
