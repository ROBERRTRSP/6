import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import type { Db } from "./db.js";
import { insertRoll } from "./db.js";
import type { DiceRoll, PlayResponse } from "./types.js";

function rollDie(): number {
  return randomInt(1, 7);
}

export function executePlay(db: Db, chosenNumber: number): PlayResponse {
  if (!Number.isInteger(chosenNumber) || chosenNumber < 1 || chosenNumber > 6) {
    throw new Error("chosenNumber must be an integer from 1 to 6");
  }

  const dice: DiceRoll = [
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
    rollDie(),
  ];
  const matches = dice.filter((v) => v === chosenNumber).length;
  const id = nanoid();
  const createdAt = Date.now();

  insertRoll(db, {
    id,
    chosenNumber,
    dice: [...dice],
    matches,
    createdAt,
  });

  return { id, dice, matches, chosenNumber };
}
