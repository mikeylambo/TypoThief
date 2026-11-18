import { describe, it } from "node:test";
import assert from "node:assert/strict";
import dictWords from "../src/content/dict.json" with { type: "json" };
import { loadDict, isValidWord } from "../src/sim/dict.ts";

describe("cleaned 3-6 letter base dictionary", () => {
  it("contains only unique, sorted lowercase ASCII words of length 3..6 with no 2-letter words", () => {
    assert.ok(Array.isArray(dictWords), "dict.json should be an array");
    assert.ok(dictWords.length >= 3000 && dictWords.length <= 4500, `unexpected dict size: ${dictWords.length}`);

    const seen = new Set<string>();
    for (let i = 0; i < dictWords.length; i++) {
      const word = dictWords[i];
      assert.match(word, /^[a-z]{3,6}$/, `invalid entry: ${word}`);
      assert.ok(word.length >= 3 && word.length <= 6, `invalid length: ${word}`);
      assert.equal(seen.has(word), false, `duplicate entry: ${word}`);
      seen.add(word);
      if (i > 0) {
        assert.ok(dictWords[i - 1] < word, `dict not strictly sorted at ${dictWords[i - 1]} >= ${word}`);
      }
    }
  });

  it("excludes regular inflections (-s/-es/-ies/-ed/-ing/-er/-est)", () => {
    const dict = loadDict();
    const excluded = [
      "carts",
      "lamps",
      "played",
      "playing",
      "faster",
      "boxes",
      "flies",
      "stopped",
      "running",
      "cried",
      "easier",
      "fastest",
      "aged",
      "died",
      "lied",
      "owed",
      "sued",
      "tied",
      "used",
      "aging",
      "being",
      "doing",
      "dying",
      "going",
      "lying",
      "owing",
      "suing",
      "tying",
      "using",
      "menus",
      "thous",
      "pends",
      "pended",
      "bigger",
      "hotter",
    ];
    for (const word of excluded) {
      assert.equal(isValidWord(dict, word), false, `expected inflection '${word}' to be excluded`);
    }
  });

  it("excludes slurs and profanity for family-friendly Playables compliance", () => {
    const dict = loadDict();
    const blocked = [
      "fag",
      "faggot",
      "nigger",
      "ass",
      "pimp",
      "prick",
      "horny",
      "bugger",
      "queer",
      "sperm",
    ];
    for (const word of blocked) {
      assert.equal(isValidWord(dict, word), false, `expected slur/profanity '${word}' to be excluded`);
    }
  });

  it("preserves true base stems ending in -s/-ed/-ing/-er and core campaign words", () => {
    const dict = loadDict();
    const required = [
      "glass",
      "bus",
      "gas",
      "bed",
      "red",
      "ring",
      "sing",
      "her",
      "clamp",
      "lamp",
      "art",
      "cart",
      "car",
      "rip",
      "trip",
      "chair",
      "hair",
      "ear",
      "tear",
      "tea",
      "ice",
      "rice",
      "dinner",
      "hammer",
      "summer",
      "priest",
      "feed",
      "seed",
      "weed",
      "deed",
      "need",
      "reed",
      "shed",
      "bred",
      "fled",
      "sped",
      "thing",
      "bring",
      "sting",
      "swing",
      "plus",
      "thus",
      "focus",
      "bonus",
      "virus",
      "minus",
      "status",
    ];
    for (const word of required) {
      assert.equal(isValidWord(dict, word), true, `expected base stem '${word}' to be present`);
    }
  });

  it("performs case-insensitive lookup and supports custom word lists in loadDict", () => {
    const dict = loadDict();
    assert.equal(isValidWord(dict, "GLASS"), true);
    assert.equal(isValidWord(dict, "Clamp"), true);
    assert.equal(isValidWord(dict, "cHaIr"), true);
    assert.equal(isValidWord(dict, "CARTS"), false);
    assert.equal(isValidWord(dict, "at"), false);
    assert.equal(isValidWord(dict, ""), false);

    const custom = loadDict(["Lamp", "CART"]);
    assert.equal(custom.size, 2);
    assert.equal(isValidWord(custom, "lamp"), true);
    assert.equal(isValidWord(custom, "cart"), true);
    assert.equal(isValidWord(custom, "glass"), false);
  });
});
