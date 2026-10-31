# Contributing to EliteTerminals

Thank you for looking. EliteTerminals is made and maintained by **CMDR SCORPZ**.

## Reporting a bug or suggesting an idea

The easiest way is the **FEEDBACK** button in the app's status bar (or the ≡ menu on a phone): it fills in a GitHub issue
with the version, the screen and the layout, and shows you exactly what will be sent. You can also open an issue here directly.

For a bug, the most useful things are the steps, what you expected, and a screenshot. If it is about a system, give its name.

## Pull requests

They are welcome, and every one is read and tried before it is merged:

1. Open an issue first for anything bigger than a small fix, so we agree on the idea before you spend time on it.
2. Run it: `npm install`, `npm run check`, `npm test`, then `npm run build && npm start` and look at the change on screen.
   Screens are judged on a PC first. Phone and tablet layouts are looked at when your change touches them.
3. Keep it small and focused: one change per pull request.
4. UI text, code, identifiers and commit messages are in **English**.
5. Tests: a change to how journals, prices or systems are read comes with a test (see `server/test/`).

What a reviewer checks, besides the tests:

- The app sends keystrokes to the game and listens on the local network, so changes to macros, server routes, file access
  and dependencies get extra attention. Say why a new dependency is needed.
- The code is yours, or comes from a source whose licence is compatible with GPL-3.0 (say where). Nothing is copied from
  other tools or from the game's own assets.
- No personal data in the code, the tests or the fixtures.

Your contribution is licensed under the same [GPL-3.0](LICENSE) as the project. Your name stays on your commits.

The maintainer may ask for changes, decline an idea that does not fit the project, or apply a change in another form.
That is not a judgement of the work.

## The name

"EliteTerminals" and its logo identify this project. A modified version should use its own name and say that it is based
on EliteTerminals by CMDR SCORPZ.
