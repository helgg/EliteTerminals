# Third-party data

## regionmap.json — Elite Dangerous codex region map

Derived from `RegionMapData.json` of https://github.com/klightspeed/EliteDangerousRegionMap (runs flattened), used to
tell which codex region a set of coordinates lies in and to draw the region borders of the galaxy map.

MIT License

Copyright (c) 2020 Ben Peddell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Colonisation facility catalogue (COLONY › PLAN)

The list of facilities, their tier points and the relative stats (chevrons) in `shared/src/colonyPlan.ts` were read by
eye from the build list of [RavenColonial](https://ravencolonial.com) (source: https://github.com/njthomson/RavenColonialWeb,
GPL-3.0, checked 2026-11-05). No code or file of it is copied; the numbers describe the game's own facilities and can be
one chevron off, so check them in the game. Thanks to its author for the reference.
