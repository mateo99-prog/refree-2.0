export type MatchForVideo = {
  id: string;
  matchNumber?: string;
  home: string;
  away: string;
};

export type RecordedGameForMatch = {
  id: string;
  title: string;
  matchId?: string;
};

const GENERIC_TEAM_WORDS = new Set([
  "baloncesto",
  "basket",
  "basketball",
  "club",
  "equipo",
  "de",
  "del",
  "el",
  "la",
  "los",
  "las",
  "cb",
  "cdb",
  "cde",
]);

export const normalizeVideoMatchText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es-ES")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const identifyingWords = (team: string) => normalizeVideoMatchText(team)
  .split(" ")
  .filter((word) => word.length >= 3 && !GENERIC_TEAM_WORDS.has(word));

const titleMatchesTeam = (normalizedTitle: string, titleWords: Set<string>, team: string) => {
  const normalizedTeam = normalizeVideoMatchText(team);
  if (!normalizedTeam) return false;
  if (normalizedTitle.includes(normalizedTeam)) return true;
  const words = identifyingWords(team);
  return words.length > 0 && words.every((word) => titleWords.has(word));
};

export const titleMatchesMatch = (title: string, match: MatchForVideo) => {
  const normalizedTitle = normalizeVideoMatchText(title);
  if (!normalizedTitle) return false;
  if (match.matchNumber && new RegExp(`(?:^|\\s)${match.matchNumber}(?:\\s|$)`).test(normalizedTitle)) return true;
  const titleWords = new Set(normalizedTitle.split(" "));
  return titleMatchesTeam(normalizedTitle, titleWords, match.home)
    && titleMatchesTeam(normalizedTitle, titleWords, match.away);
};

export const findRecordedGameForMatch = <T extends RecordedGameForMatch>(match: MatchForVideo, games: T[]) =>
  games.find((game) => game.matchId === match.id)
  || games.find((game) => !game.matchId && titleMatchesMatch(game.title, match));

export const findMatchForVideoTitle = <T extends MatchForVideo>(title: string, matches: T[]) =>
  matches.find((match) => titleMatchesMatch(title, match));
