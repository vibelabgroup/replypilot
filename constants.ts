import { Review, ChatMessage, Feature } from './types';

export const REVIEWS: Review[] = [
    {
        text: "Det har fuldstændig ændret min hverdag. Jeg plejede at stresse over ubesvarede opkald når jeg stod hos en kunde. Nu slapper jeg af velvidende at Replypilot griber dem.",
        author: "Tømrer Jensen",
        role: "Mester",
        stars: 5
    },
    {
        text: "Mine kunder elsker det. De føler sig hørt med det samme, og jeg får en SMS med det samme om hvad de vil. Det er genialt og alle pengene værd.",
        author: "Murermester Bo",
        role: "Ejer, Bo Byg",
        stars: 5
    },
    {
        text: "Vi har øget vores konvertering markant. Før ringede folk videre til den næste tømrer, hvis vi ikke tog den. Nu booker vi dem direkte i kalenderen via SMS.",
        author: "Morten",
        role: "Elektrikeren ApS",
        stars: 5
    },
    {
        text: "Installation var super nem. Jeg troede det ville være besværligt, men det kørte efter 5 minutter. Kan kun anbefale det til andre håndværkere.",
        author: "Anlægsgartneren",
        role: "København",
        stars: 5
    },
    {
        text: "Endelig en løsning der fungerer i weekenden. Jeg kan holde fri med familien uden at miste kunder til konkurrenterne. Det kører bare.",
        author: "Malermesteren",
        role: "Aarhus",
        stars: 5
    },
    {
        text: "Jeg var skeptisk over for AI, men det her virker bare. Kunderne tror de skriver med en rigtig person, og det sikrer mig opgaven.",
        author: "VVS Ole",
        role: "Odense",
        stars: 5
    }
];

export const CONVERSATION_STEPS: ChatMessage[] = [
    { id: '1', type: 'event', text: 'I dag 09:41', delay: 0 },
    { id: '2', type: 'event', text: 'Ubesvaret opkald', delay: 500 },
    { id: '3', type: 'system', text: 'Hej! 👋 Jeg står lige på en stige. Hvad kan jeg hjælpe med?', delay: 1500 },
    { id: '4', type: 'user', text: 'Hej, jeg skal bruge et tilbud på nyt tag.', delay: 3500 },
    { id: '5', type: 'system', text: 'Det kan jeg godt klare. Hvornår passer det dig at jeg kigger forbi?', delay: 6000 },
    { id: '6', type: 'user', text: 'Er du ledig i morgen eftermiddag?', delay: 8500 },
    { id: '7', type: 'system', text: 'Ja, kl 14:00. Skal vi sige det?', delay: 10500 },
    { id: '8', type: 'user', text: 'Perfekt!', delay: 12000 },
];

export const FEATURES: Feature[] = [
    {
        icon: 'Bot',
        title: "Digital Receptionist",
        description: "En intelligent assistent, der forstår dine kunder og svarer professionelt på dine vegne – præcis som du selv ville gøre."
    },
    {
        icon: 'Zap',
        title: "Øjeblikkeligt svar",
        description: "Inden for 5 sekunder modtager kunden en personlig SMS. Du stopper dem fra at ringe videre til konkurrenten."
    },
    {
        icon: 'Clock',
        title: "Arbejder 24/7",
        description: "Weekender, aftener og ferier. Replypilot tager aldrig fri, så du kan holde fri med god samvittighed."
    },
    {
        icon: 'BellRing',
        title: "Notifikationer",
        description: "Få et hurtigt referat af samtalen sendt direkte til din indbakke eller som SMS, så snart en aftale er i hus."
    },
    {
        icon: 'CalendarCheck2',
        title: "Kalender Booking",
        description: "Systemet kan automatisk foreslå ledige tider og lægge aftalerne direkte i din arbejdskalender."
    },
    {
        icon: 'SmartphoneNfc',
        title: "Ingen App",
        description: "Glem alt om at downloade nye apps. Det hele kører automatisk i baggrunden via din nuværende telefon."
    }
];