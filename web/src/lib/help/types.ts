// One tutorial per screen. Keep it to what the screen really does today: when a screen changes, its
// tutorial changes in the same delivery and `reviewed` takes the app version of that review.
export interface HelpTopic {
  title: string;
  text: string;
}

export interface HelpDoc {
  /** What the screen is for, in a sentence or two. */
  about: string;
  /** What must exist or be set before it works (journals, binds, network). */
  setup: HelpTopic[];
  /** The panels and buttons, one topic each. */
  use: HelpTopic[];
  tips: string[];
  /** What comes from the game and what comes from the community services. */
  data: string;
  /** The app version in which this tutorial was last checked against the screen. */
  reviewed: string;
  /** A screen still being built: the modal says so and lists what is coming. */
  soon?: string[];
}
