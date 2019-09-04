'use strict'

// Dependencies
const https = require('https');
const restify = require('restify');
const builder = require('botbuilder');
const marketcloud = require('marketcloud-node');

const env = require('dotenv');
env.config();

// connector to Marketcloud
const client = new marketcloud.Client({
    public_key: process.env.MC_PUBLIC_KEY,
    secret_key: process.env.MC_SECRET_KEY
})

// Create chat connector for communicating with the Bot Framework Service
const connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

let productCategories = [];

let phrases = [
    "Perhaps ‘f*** off’ might be too kind.",
    "Who’d want to be men of the people when there’s people like you?",
    "I’ve seen your frown and it’s like looking down the barrel of a gun.",
    "With folded arms you occupied the bench like toothache.",
    "The next time that I caught my own reflection it was on its way to meet you, thinking of excuses to postpone.",
    "If you’re gonna try and walk on water, make sure you wear your comfortable shoes.",
    "Stop making the eyes at me and I’ll stop making the eyes at you.",
    "You’re the first day of spring with a septum piercing.",
    "You’re rarer than a can of Dandelion & Burdock.",
    "Don't believe the hype.",
    "Four stars out of five."
];


client.categories.list({ fields: 'id,name' })
    .then((response) => {
        productCategories = response['data'];
        // Handle success
        /* {
            status: true,
            data:
            [
                {
                    id: 1,
                    name: "Albums"
                },
                {
                    id: 2,
                    name: "Others"
                },
                {
                    id: 3,
                    name: "Accessories"
                },
                {
                    id: 4,
                    name: "Clothes"
                }
            ]
        } */
    })
    .catch((error) => {
        // Error
    });

// Bot Setup
const bot = new builder.UniversalBot(connector);

bot.on('error', function (e) {
    console.log('And error ocurred', e);
});

// LUIS Recognizer Setup
const recogniser = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
/* recogniser.onEnabled((context, callback) => {
    if (context.dialogStack().length > 0) {
        // in the conversation
        callback(null, false);
    }
    else {
        callback(null, true);
    }
}); */

bot.recognizer(recogniser);

bot.dialog('SearchBuy',
    [
        (session, args, next) => {
            if (args.intent.entities.length === 0) {
                // Prompt if the user didn't type what to search/buy
                let categoriesNames = productCategories.map(obj => obj['name']);

                builder.Prompts.choice(
                    session,
                    'Could you specify the product category?',
                    categoriesNames,
                    {
                        listStyle: builder.ListStyle.button,
                        retryPrompt: 'Laaaaaaadieeeeees, Not a valid option, please try again.'
                    },
                );
            }
            else {
                let entity = (args.intent.entities[0])['type'];
                let categoryType = ((entity + '').split('::'))[1];
                next({ response: categoryType });
            }
        },
        (session, results, next) => {
            let categoryType = results.response;
            if (!categoryType) {
                session.endDialog("Sorry, man, that's definitely not a valid option.");
            }
            else {
                session.send('I found these products');

                let categorySelected = productCategories.find(obj =>
                    obj['name'] === categoryType);

                let categoryId = categorySelected['id'];

                let query = { category_id: categoryId, fields: 'id,name,description,stock_status,price,images' };

                session.sendTyping();

                client.products.list(query)
                    .then((response) => {
                        // Handle success
                        let products = session.dialogData.products = response['data'];

                        let productsCarousel = products.map(obj => {

                            return new builder.HeroCard(session)
                                .title(obj['name'])
                                .subtitle((obj['stock_status'] + '').split('_').join(' ').toUpperCase())
                                .text(obj['description'])
                                .images([
                                    builder.CardImage.create(session, (obj['images'])[0])
                                ]);
                        });
                        /* {
                            status: true,
                            data:
                            [
                                {
                                    id: 1,
                                    name: "Weissbier-Radler",
                                    description: "A brief description...",
                                    price: "10",
                                    stock_status: "",
                                    images: [
                                        "url"
                                    ]
                                }
                            ]
                        } */
                        // create reply with Carousel AttachmentLayout
                        let reply = new builder.Message(session)
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(productsCarousel);

                        session.send(reply);

                        let productsNames =
                            (products.filter(obj => (obj['stock_status']).toUpperCase() === ('in_stock').toUpperCase()))
                                .map(obj => obj['name']);

                        builder.Prompts.choice(
                            session,
                            'R U interested in any?',
                            productsNames,
                            {
                                listStyle: builder.ListStyle.button,
                                retryPrompt: 'Laaaaaaadieeeeees. Not a valid option, please try again.'
                            },
                        );
                    })
                    .catch((error) => {
                        // Handle the error
                    });
            }
        },
        (session, results) => {
            let productSelectedName = results.response.entity;

            let product = (session.dialogData.products
                .find(obj => (obj['name']).toUpperCase() === productSelectedName.toUpperCase()));

            if (product) {
                let card =
                    new builder.HeroCard(session)
                        .title(product['name'])
                        .subtitle(product['display_price'])
                        .text(product['description'])
                        .images([
                            builder.CardImage.create(session, (product['images'])[0])
                        ]);

                let msg = new builder.Message(session).addAttachment(card);
                session.send('Your order has been done successfully.');
                session.send(msg);

                let video =
                    new builder.VideoCard(session)
                        .title('Arctic Monkeys')
                        .subtitle('Tranquility Base Hotel & Casino')
                        .text("The new album, out May 11th, 2018. Pre-order special edition vinyl & CD")
                        .image(builder.CardImage.create(session, 'https://i.ytimg.com/vi/6uGQ_ypTw08/maxresdefault.jpg'))
                        .media([
                            { url: 'https://www.youtube.com/watch?v=6uGQ_ypTw08' }
                        ])
                        .buttons([
                            builder.CardAction.openUrl(session, 'https://www.youtube.com/watch?v=6uGQ_ypTw08', 'Watch The Preview!')
                        ]);

                let vid = new builder.Message(session).addAttachment(video);
                session.send('NEW ALBUM COMING');
                session.endConversation(vid);
            }
        }
    ]
).triggerAction({
    matches: 'SearchBuy'
}).endConversationAction(
    "EndOrder", "Forcing a Smile... Waving Goodbye...",
    {
        matches: ['None', /^cancel$|^[good]?bye$|^no$/i],
        confirmPrompt: "This will cancel your order. R U Sure?"
    }
);

bot.dialog('None',
    [
        (session, args, next) => {
            if (args.response) {
                builder.Prompts.text(session, "Do me a favour and write anything else...");
            }
            else {
                session.sendTyping();
                const card =
                    new builder.AnimationCard(session)
                        .title('Invoice me for the microphone')
                        .subtitle('if you need to')
                        .image(builder.CardImage.create(session, 'https://78.media.tumblr.com/tumblr_m2lo5iwtnk1ru3mugo1_1280.jpg'))
                        .media([
                            { url: 'https://78.media.tumblr.com/9cd805d05c1b2fae2a0992e21e8b911e/tumblr_inline_nnumb9EzK71ru6lri_500.gif' }
                        ]);

                let msgcard = new builder.Message(session).addAttachment(card);

                session.send(msgcard);

                builder.Prompts.text(session, 'Well... Type anything you want now or snap out of it.');
            }
        },
        (session, results) => {
            let text = results.response;

            let documents = {
                "documents": [
                    {
                        "language": "en",
                        "id": "1",
                        "text": text
                    }
                ]
            };

            session.sendTyping();

            get_sentiments(documents, (response) => {
                let body = '';
                response.on('data', (d) => {
                    body += d;
                });
                response.on('end', () => {
                    let body_ = JSON.parse(body);
                    let body__ = JSON.stringify(body_, null, '  ');
                    console.log(body__);

                    let score = ((body_['documents'])[0])['score'];

                    let msg = phrases[Math.round(score * 10)];

                    session.send(msg);

                    session.replaceDialog('None', { response: true });
                });
                response.on('error', (e) => {
                    console.log('Error: ' + e.message);
                });
            });
        }
    ]
).triggerAction({
    matches: 'None'/* ,
    onSelectAction: (session, args) => {
        // Execute just before the dialog launches
        // Change the default behaviour
        // The default behaviour is to replace the dialog stack
        session.beginDialog('SearchBuy', args);
    } */
}).endConversationAction(
    "EndNone", "Forcing a Smile... Waving Goodbye...",
    {
        matches: ['SearchBuy', /^cancel$|^[good]?bye$|^no$/i],
        confirmPrompt: "This will end our meaningless chat. R U Sure?"
    }
);

// Sentiment Analysis
let get_sentiments = (documents, response_handler) => {
    let body = JSON.stringify(documents);

    let request_params = {
        method: 'POST',
        hostname: process.env.uri_TA,
        path: process.env.path_TA_Sentiment,
        headers: {
            'Ocp-Apim-Subscription-Key': process.env.TA_ACCESS_KEY,
        }
    };

    let req = https.request(request_params, response_handler);
    req.write(body);
    req.end();
    return body;
}


// Setup Restify Server
const server = restify.createServer();

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Listen for for port
server.listen(
    process.env.port || process.env.PORT || 3978,
    () => {
        console.log('%s listening to %s', server.name, server.url);
    }
);
