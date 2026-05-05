export interface Prompt {
  id: string;
  text: string;
}

export const PROMPTS: Prompt[] = [
  // ---- everyday objects ----
  { id: "beach-item", text: "What is an item you would bring to the beach?" },
  { id: "kitchen-drawer", text: "Name something you'd find in a kitchen drawer." },
  { id: "first-aid", text: "What's something you'd pack in a first aid kit?" },
  { id: "school-bag", text: "What's something a student keeps in their backpack?" },
  { id: "car-glovebox", text: "What might be hiding in someone's glovebox?" },
  { id: "toolbox", text: "What's a tool you'd find in a toolbox?" },
  { id: "garden-shed", text: "What might be in a garden shed?" },
  { id: "office-desk", text: "What's something on a messy office desk?" },
  { id: "hotel-room", text: "What's a small thing you'd find in a hotel room?" },
  { id: "junk-drawer", text: "What's hiding in your junk drawer?" },

  // ---- food & drink ----
  { id: "pizza-topping", text: "Name a pizza topping." },
  { id: "breakfast-food", text: "Name a classic breakfast food." },
  { id: "weird-snack", text: "Name a snack that's weirdly satisfying." },
  { id: "comfort-food", text: "What's the ultimate comfort food?" },
  { id: "ice-cream-flavor", text: "Name an ice cream flavor." },
  { id: "salad-ingredient", text: "What's an ingredient in a great salad?" },
  { id: "drink-after-work", text: "What's a drink to wind down with after work?" },
  { id: "fancy-restaurant-dish", text: "Name a dish you'd order at a fancy restaurant." },
  { id: "road-trip-snack", text: "Name a perfect road-trip snack." },
  { id: "weird-pizza", text: "What's a pizza topping that doesn't belong?" },

  // ---- places ----
  { id: "vacation-spot", text: "What's a great vacation destination?" },
  { id: "place-avoid", text: "What's a place you'd avoid at all costs?" },
  { id: "city-landmark", text: "Name a famous landmark." },
  { id: "scary-place", text: "Where would you not want to be alone at night?" },
  { id: "first-date-spot", text: "Name a great place for a first date." },
  { id: "kid-paradise", text: "What's a kid's idea of paradise?" },
  { id: "boring-place", text: "What's the most boring place on earth?" },
  { id: "peaceful-place", text: "Where do you go to feel at peace?" },

  // ---- characters / people ----
  { id: "fictional-villain", text: "Name a fictional villain." },
  { id: "superhero", text: "Name a superhero (real or made up)." },
  { id: "annoying-coworker", text: "What's a trait of the most annoying coworker?" },
  { id: "person-at-bad-party", text: "Describe a person you'd meet at a bad party." },
  { id: "movie-character", text: "Name a memorable movie character." },
  { id: "animal-spirit", text: "What animal best matches your personality?" },
  { id: "celeb-cameo", text: "Name a celebrity who'd make a great cameo in a sitcom." },

  // ---- activities / hobbies ----
  { id: "weekend-activity", text: "What's a perfect Saturday activity?" },
  { id: "boring-hobby", text: "Name a hobby that sounds boring on paper." },
  { id: "olympic-sport", text: "Name an Olympic sport." },
  { id: "fake-olympic-sport", text: "Name an Olympic sport that should exist but doesn't." },
  { id: "rainy-day-activity", text: "What do you do on a rainy day?" },
  { id: "thing-to-collect", text: "What's something people collect?" },

  // ---- emotions / scenarios ----
  { id: "small-victory", text: "What's a small daily victory?" },
  { id: "tiny-betrayal", text: "What's a tiny everyday betrayal?" },
  { id: "thing-overrated", text: "What's something everyone says is great but isn't?" },
  { id: "thing-underrated", text: "What's something genuinely underrated?" },
  { id: "guilty-pleasure", text: "Name a guilty pleasure." },
  { id: "irrational-fear", text: "What's an irrational fear?" },
  { id: "mood-killer", text: "What's a guaranteed mood-killer?" },
  { id: "comfort-thing", text: "What's something that always cheers you up?" },

  // ---- hypotheticals ----
  { id: "wish-skill", text: "What's a skill you wish you had?" },
  { id: "stranded-island", text: "What's one thing you'd take to a deserted island?" },
  { id: "if-rich", text: "First thing you'd buy if you were suddenly rich?" },
  { id: "superpower", text: "What's a superpower you'd actually use?" },
  { id: "time-period", text: "What time period would you visit?" },
  { id: "last-meal", text: "What's your last-meal-on-earth dinner?" },
  { id: "gift-self", text: "What's a gift you'd love to receive?" },
  { id: "trade-job", text: "What job would you take for a day?" },

  // ---- music / pop culture ----
  { id: "karaoke-song", text: "Name a karaoke song you'd actually sing." },
  { id: "guilty-jam", text: "What's a song you secretly love?" },
  { id: "movie-quote", text: "Name an iconic movie line." },
  { id: "tv-binge", text: "What's a show you've binged in one weekend?" },
  { id: "wedding-dance", text: "Name a song that gets played at every wedding." },

  // ---- weather / nature ----
  { id: "weather-mood", text: "What weather matches your current mood?" },
  { id: "outdoor-activity", text: "Name a great outdoor activity." },
  { id: "creepy-crawly", text: "Name a creature you'd rather not encounter." },
  { id: "park-thing", text: "What's something you'd see at a park?" },

  // ---- gross / weird ----
  { id: "gross-combo", text: "What's the grossest food combo that actually works?" },
  { id: "smell-memory", text: "Name a smell that brings back memories." },
  { id: "dad-joke", text: "What's a quintessential dad joke topic?" },
  { id: "old-tech", text: "Name an outdated piece of technology." },

  // ---- holidays / events ----
  { id: "halloween-costume", text: "Name a Halloween costume." },
  { id: "birthday-gift", text: "What's a classic birthday gift?" },
  { id: "thanksgiving-side", text: "Name a Thanksgiving side dish." },
  { id: "wedding-detail", text: "Name something at every wedding." },
  { id: "party-game", text: "Name a classic party game." },

  // ---- workplace ----
  { id: "office-meeting", text: "What's something said in every office meeting?" },
  { id: "remote-distraction", text: "What's a remote-work distraction?" },
  { id: "boss-pet-peeve", text: "What's a boss's pet peeve?" },

  // ---- tech / online ----
  { id: "annoying-website", text: "What's an annoying thing on websites?" },
  { id: "phone-app", text: "Name an app on most phones." },
  { id: "cringe-tweet", text: "What kind of tweet would make you cringe?" },
];

export function pickRandomPrompt(): Prompt {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

export function pickRandomPromptExcluding(usedIds: Set<string>): Prompt {
  const available = PROMPTS.filter((p) => !usedIds.has(p.id));
  if (available.length === 0) return pickRandomPrompt();
  return available[Math.floor(Math.random() * available.length)];
}
