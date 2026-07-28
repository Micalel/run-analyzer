/**
 * Based of DiamondPearlPlatinum_Kaizo_Auto_Randomized.nds.log 
 *
 * This type represents the rulebreaking data extracted from the log file. (if you don't know what is rulebreaking in Ironmon,
 * what are you peeking at?)
 * This is server-side only, not intended to be used on client-side if a run isn't finished yet
 *
 * This is heavy stuff, movesets and TM/HM compatibility are included but be aware if you're using this locally in can be
 * heavy.
 */

// Header section //

export interface RandomizerLogMeta {
  randomizerVersion: string; 
  seed: string;              
  settingsString: string;    // This is encoded.
  moveDataStatus?: string; // This is only present if the log was generated with move data enabled, testing stuff.
  moveTutorStatus?: string; // Same idea as the moveDataStatus, but for the move tutor.
}

// Randomized Evolutions // 

export interface EvolutionChange {
  from: string;
  to: string[]; // Some evolutions (like Eevee) can evolve into multiple pokemons, thanks to them all the pokemon will have an array of evolutions.
                // Please, it's really important and not randomly placed here just because.
}

// Pokemon Base Stats & Types //

export interface HeldItem { // This one is a bit tricky, weird format file, we'll keep it like a normalized object for easier use.
  name: string;
  rateLabel: string;
} // TODO: check for improvements

export interface PokemonBaseStats {
  num: number;
  name: string;
  types: string[]; // This will be an array thanks to the double types pokemons (i.e Rock/Ground, Water/Ice, etc)
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  spd: number;
  ability1: string;
  ability2?: string; // Some have two Abilities, some have one. Either way, only one will be played and this will be used to check for the second ability if it exists.
  heldItems: HeldItem[]; // Depending on the pokemon and his abilities, some won't have any held items.
}

// Random Starters //

export interface StarterAssignment { 
  slot: 1 | 2 | 3;
  species: string; // In randomized, this won't be a static pokemon, it will be a randomized one. (e.g. Bulbasaur -> Rattata)
}

// Trainers Pokemon //

export interface TrainerPartyMember {
  species: string; 
  level: number;

}

export interface TrainerEntry {

  index: number; // This is mainly because the log file uses a "Trainer #1" format, but it's not intuitive so we'll be using numbers.
  originalTrainerName: string;
  randomizedTrainerName: string;
  team: TrainerPartyMember[];
}

// Static Pokemon //

export interface StaticEncounter {
  original: string; 
  randomized: string; 
  isEgg: boolean; // So some encounters appear to be eggs, but they are not. This is a flag to check if the encounter is an egg or not.
}

// Wild Pokemon //

export interface WildEncounterEntry { // This will be used to store the wild encounters.
  species: string;
  levelMin: number;
  levelMax: number;
  stats: {
    hp: number;
    atk: number;
    def: number;
    spAtk: number;
    spDef: number;
    spd: number;
  };
}

export interface WildEncounterSet {
  setId: number; // Same as the trainer index.
  
  location: string;
  method: string;
  /** Original way of storing: 
   * 
   * "Joliberges Surfing (rate=10)" 
   * 
   * Our way of storing: 
   * 
   * location="Joliberges", method="Surfing" */

  rate: number;
  encounters: WildEncounterEntry[]; // This is an array because 99% of locations have multiple wild encounters.
}

// In-Game Trades //

export interface InGameTrade {
  requestedSpecies: string;
  npcName: string;
  givenOriginalSpecies: string;
  givenRandomizedSpecies: string;
}

// Pickup Items //

export interface PickupItemTier {
  name: string;
  probabilityPercent: number; // From talking in percentages to numbers, it means 1% = 1, 100% = 100. Mainly for personal convenience,
                             // but you can change that to percentages by changing
                             // probabilityPercent = probabilityPercent / 100;  

}

export interface PickupLevelBracket { // This is the part for the pokemon that can pickup items, mostly useless but still logged.
  levelMin: number; 
  levelMax: number;
  tiers: PickupItemTier[];
}

// Pokemon Movesets //

export interface LevelUpMove {

  level: number; 
  move: string;

}

export interface PokemonMoveset {
  pokemonNum: number;
  originalSpecies: string;
  levelUpMoves: LevelUpMove[];
  eggMoves: string[];
  
}

// TM Moves - TM Compatibility //

export interface TmMoveEntry {

  id: string;
  name: string;

}

export interface TmHmCompatibility {
  pokemonNum: number;
  species: string;

  /**
   * So this needs to be explained a bit, if you ever want to change this.
   * So this will be an array of booleans, each boolean will represent a TM move, if the pokemon can learn it or not. 0 = TM01, 1 = TM02, etc..
   * It's to check by number and not by name, names can change but numbers won't no matter the settings of the randomizer.
   */

  tmCompatible: boolean[];

  /**
    * Same as the TM compatibility, but for HM moves. 0 = HM01, 1 = HM02, etc..
    * Why isn't there a HM move list? Blame the randomizer, it doesn't log the HM moves, only the compatibility.
   */

  hmCompatible: boolean[];
}

// Root //

export interface ParsedRandomizerLog {
  meta: RandomizerLogMeta;
  evolutions: EvolutionChange[];
  baseStats: PokemonBaseStats[];
  starters: StarterAssignment[];
  movesets: PokemonMoveset[];
  tmMoves: TmMoveEntry[];
  hmMoveNames: string[];
  tmHmCompatibility: TmHmCompatibility[];
  trainers: TrainerEntry[];
  staticEncounters: StaticEncounter[];
  wildEncounters: WildEncounterSet[];
  inGameTrades: InGameTrade[];
  pickupItems: PickupLevelBracket[];
}