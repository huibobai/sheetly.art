/**
 * Names we will not send to the image model.
 *
 * Matching is case-insensitive, ignores accents, and treats punctuation as a
 * space. A term hits only as a whole word or phrase, so "marvelous" does not
 * match "marvel", "marion" does not match "mario", and "documentary" does not
 * match "dc".
 *
 * Accepted rough edges, on purpose:
 * - "mario" is a common given name and a character. "mario" matches; "marion" does not.
 * - "dc" is a whole word, so "Washington DC" matches. "documentary" does not.
 * - "sonic" matches the character. "supersonic" does not.
 * - "madonna" matches the singer. It can also match the religious title.
 * - A personal name that is also a character (Kirby, Zelda) can match.
 *
 * Keep new entries specific. Do not add ordinary words (game, studio, white, art).
 */

export const BLOCKLIST_MESSAGE =
  "We can't make stickers of brands, characters or famous people. Try your own photo!";

const RAW_TERMS = [
  // Studios, brands, franchises
  "Disney",
  "Pixar",
  "Ghibli",
  "Studio Ghibli",
  "Simpsons",
  "LEGO",
  "Duplo",
  "Marvel",
  "Avengers",
  "DC",
  "DC Comics",
  "Pokémon",
  "Pokemon",
  "Nintendo",
  "Sanrio",
  "Star Wars",
  "StarWars",
  "Star Trek",
  "StarTrek",
  "Harry Potter",
  "HarryPotter",
  "Hogwarts",
  "Barbie",
  "Mattel",
  "Nike",
  "Nikes",
  "Adidas",
  "Coca-Cola",
  "Cocacola",
  "Warner Bros",
  "Warner Brothers",
  "DreamWorks",
  "Lucasfilm",
  "PlayStation",
  "Xbox",
  "Minecraft",
  "Roblox",
  "Fortnite",
  "Transformers",
  "Game of Thrones",
  "BTS",
  "Blackpink",

  // Characters
  "Mickey",
  "Mickey Mouse",
  "Minnie Mouse",
  "Donald Duck",
  "Buzz Lightyear",
  "Lightning McQueen",
  "Toy Story",
  "The Incredibles",
  "Monsters Inc",
  "Wall-E",
  "WallE",
  "Ratatouille",
  "Finding Nemo",
  "The Lion King",
  "Hakuna Matata",
  "Encanto",
  "Totoro",
  "Spirited Away",
  "Ponyo",
  "Mononoke",
  "Calcifer",
  "Shrek",
  "Kung Fu Panda",
  "How to Train Your Dragon",
  "Puss in Boots",
  "Despicable Me",
  "Minions",
  "Gru",
  "SpongeBob",
  "SquarePants",
  "Squidward",
  "Patrick Star",
  "Peppa Pig",
  "Peppa",
  "Paw Patrol",
  "Bluey",
  "Cocomelon",
  "Baby Shark",
  "Baby Yoda",
  "Sesame Street",
  "Elmo",
  "Cookie Monster",
  "Big Bird",
  "Kermit",
  "Miss Piggy",
  "Muppets",
  "Snoopy",
  "Charlie Brown",
  "Garfield",
  "Winnie-the-Pooh",
  "Tigger",
  "Eeyore",
  "Paddington",
  "Hello Kitty",
  "HelloKitty",
  "Kuromi",
  "Cinnamoroll",
  "Gudetama",
  "My Melody",
  "Pompompurin",
  "Keroppi",
  "Badtz-Maru",
  "Pikachu",
  "Charizard",
  "Pokeball",
  "Poke Ball",
  "Mario",
  "Luigi",
  "Bowser",
  "Yoshi",
  "Princess Peach",
  "Donkey Kong",
  "Zelda",
  "Kirby",
  "Samus",
  "Metroid",
  "Pac-Man",
  "Pacman",
  "Sonic",
  "Sonic the Hedgehog",
  "Batman",
  "Superman",
  "Spider-Man",
  "Spiderman",
  "Iron Man",
  "Wonder Woman",
  "Captain America",
  "Darth Vader",
  "Yoda",
  "Grogu",
  "Mandalorian",
  "Chewbacca",
  "Lightsaber",
  "R2-D2",
  "R2D2",
  "BB-8",
  "BB8",
  "Voldemort",
  "Dumbledore",
  "Hermione",
  "Naruto",
  "Goku",
  "Dragon Ball",
  "DragonBall",
  "Sailor Moon",
  "Thanos",
  "Wolverine",
  "Deadpool",
  "Harley Quinn",
  "Thor",
  "Loki",
  "Aquaman",
  "Green Lantern",

  // Celebrities. Full names unless the mononym is the name people actually use.
  "Taylor Swift",
  "Beyoncé",
  "Elvis",
  "Elvis Presley",
  "Michael Jackson",
  "Rihanna",
  "Ariana Grande",
  "Brad Pitt",
  "Angelina Jolie",
  "Leonardo DiCaprio",
  "Tom Cruise",
  "Kim Kardashian",
  "Kanye West",
  "Donald Trump",
  "Barack Obama",
  "Obama",
  "Elon Musk",
  "Cristiano Ronaldo",
  "Ronaldo",
  "Lionel Messi",
  "Messi",
  "LeBron James",
  "Oprah",
  "Oprah Winfrey",
  "Lady Gaga",
  "Gaga",
  "Billie Eilish",
  "Dua Lipa",
  "Selena Gomez",
  "Justin Bieber",
  "The Weeknd",
  "Weeknd",
  "Bad Bunny",
  "Shakira",
  "Ed Sheeran",
  "Zendaya",
  "Timothée Chalamet",
  "Keanu Reeves",
  "Scarlett Johansson",
  "Morgan Freeman",
  "Emma Watson",
  "Daniel Radcliffe",
  "Robert Downey",
  "Chris Hemsworth",
  "Eminem",
  "Madonna",
  "Harry Styles",
] as const;

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ +/g, " ");
}

function buildPhrases(terms: readonly string[]): readonly string[] {
  const phrases = new Set<string>();
  for (const term of terms) {
    const phrase = normalizeForMatch(term);
    if (!phrase) {
      continue;
    }
    if (phrase.length < 2) {
      throw new Error(`Blocklist term is too short: ${term}`);
    }
    phrases.add(phrase);
  }
  return [...phrases];
}

const PHRASES = buildPhrases(RAW_TERMS);

/** The matched phrase, or null. Empty and non-strings do not match. */
export function blockedTermIn(text: string): string | null {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }
  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return null;
  }
  const padded = ` ${normalized} `;
  for (const phrase of PHRASES) {
    if (padded.includes(` ${phrase} `)) {
      return phrase;
    }
  }
  return null;
}

export const RIGHTS_REQUIRED_MESSAGE =
  "Please confirm you can use this photo (and that anyone in it is OK with it) before we style it.";

/**
 * User-supplied strings that are allowed to influence generation.
 * imageUrl is not included: it is a storage reference, not a prompt, and a
 * path must not be able to false-positive the name list.
 * A file name is included so it is screened if a client starts sending one.
 */
const USER_TEXT_FIELDS = ["style", "prompt", "text", "caption", "fileName", "filename", "file_name"] as const;

export function isRightsConfirmed(value: unknown): boolean {
  return value === true;
}

export function userSuppliedGenerationTexts(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    return [];
  }
  const record = body as Record<string, unknown>;
  const texts: string[] = [];
  for (const key of USER_TEXT_FIELDS) {
    const value = record[key];
    if (typeof value === "string") {
      texts.push(value);
    }
  }
  return texts;
}

export type GenerateRequestRejection = {
  status: 400;
  error: string;
};

/**
 * Checks that run before quota and before fal.
 * A missing checkbox or a blocked name does not use a quota slot and does not call the model.
 * A result fal later flags as NSFW is different: that slot was already taken. See the generate route.
 */
export function rejectionForGenerateBody(body: unknown): GenerateRequestRejection | null {
  if (!body || typeof body !== "object" || !isRightsConfirmed((body as { rightsConfirmed?: unknown }).rightsConfirmed)) {
    return { status: 400, error: RIGHTS_REQUIRED_MESSAGE };
  }
  for (const text of userSuppliedGenerationTexts(body)) {
    if (blockedTermIn(text)) {
      return { status: 400, error: BLOCKLIST_MESSAGE };
    }
  }
  return null;
}

