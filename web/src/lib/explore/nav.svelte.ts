// A button on another screen asks for EXPLORE to open on a system: the app switches tab and the screen loads it.
// `taken` is the last request EXPLORE acted on: the screen may not exist yet when the button is pressed.
export const exploreRequest = $state({ seq: 0, taken: 0, system: '', id64: 0 });

export function openInExplore(system: string, id64 = 0) {
  exploreRequest.system = system;
  exploreRequest.id64 = id64;
  exploreRequest.seq++;
}
