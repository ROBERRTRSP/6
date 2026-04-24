export type DiceRoll = [number, number, number, number, number, number];

export type PublicSettings = {
  primaryColor: string;
  soundEnabled: boolean;
};

export type PlayResponse = {
  id: string;
  dice: DiceRoll;
  matches: number;
  chosenNumber: number;
};
