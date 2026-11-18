const INK = "#1B1814";
const CREAM = "#FFF8E7";
const GOLD = "#FFD147";
const CORAL = "#FF6B57";
const MINT = "#4CD995";
const SLATE = "#8B95A5";
const SLATE_DARK = "#596373";
const WOOD = "#D98A4E";

function wrapSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function sparkles(color = GOLD): string {
  return `<path d="M13 18l2-5 2 5 5 2-5 2-2 5-2-5-5-2zM64 13l1.5-3.5 1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5z" fill="${color}" stroke="${INK}" stroke-width="2"/>`;
}

function frameSafe(solved: boolean): string {
  if (!solved) {
    return (
      `<rect x="14" y="16" width="52" height="50" rx="6" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="20" y="22" width="40" height="38" rx="3" fill="${SLATE_DARK}" stroke="${INK}" stroke-width="2.5"/>` +
      `<circle cx="40" cy="41" r="11" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
      `<circle cx="40" cy="41" r="4" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M40 30v4M40 48v4M29 41h4M47 41h4M56 34v14" stroke="${INK}" stroke-width="2.5"/>`
    );
  }
  return (
    sparkles() +
    `<rect x="12" y="18" width="46" height="48" rx="5" fill="${SLATE_DARK}" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="17" y="23" width="36" height="38" rx="2" fill="#2F3640" stroke="${INK}" stroke-width="2.5"/>` +
    `<circle cx="31" cy="50" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<circle cx="41" cy="47" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<circle cx="36" cy="41" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M56 18l14 6v36l-14 6z" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="62" cy="41" r="3" fill="${MINT}" stroke="${INK}" stroke-width="2"/>`
  );
}

function frameDog(solved: boolean): string {
  const base =
    `<path d="M22 28l-8-12 14 6zM58 28l8-12-14 6z" fill="${WOOD}" stroke="${INK}" stroke-width="3"/>` +
    `<ellipse cx="40" cy="44" rx="22" ry="19" fill="#E8A96B" stroke="${INK}" stroke-width="3"/>` +
    `<ellipse cx="40" cy="50" rx="13" ry="9" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M24 61h32" stroke="${CORAL}" stroke-width="5"/>` +
    `<path d="M24 61h32" stroke="${INK}" stroke-width="2"/>`;
  if (!solved) {
    return (
      base +
      `<path d="M27 36l8 4M53 36l-8 4" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="32" cy="41" r="2.5" fill="${INK}"/><circle cx="48" cy="41" r="2.5" fill="${INK}"/>` +
      `<ellipse cx="40" cy="47" rx="4" ry="3" fill="${INK}"/>` +
      `<path d="M32 54l4-3 4 3 4-3 4 3" stroke="${INK}" stroke-width="2.5" fill="${CREAM}"/>`
    );
  }
  return (
    sparkles(MINT) +
    base +
    `<path d="M29 39c0-2 3-2 3 0 0-2 3-2 3 0 0 3-3 5-3 5s-3-2-3-5zM45 39c0-2 3-2 3 0 0-2 3-2 3 0 0 3-3 5-3 5s-3-2-3-5z" fill="${CORAL}" stroke="${INK}" stroke-width="1.8"/>` +
    `<ellipse cx="40" cy="47" rx="4" ry="3" fill="${INK}"/>` +
    `<path d="M34 52c3 4 9 4 12 0" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M38 55v5a3 3 0 0 0 6 0v-5" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>`
  );
}

function frameLaser(solved: boolean): string {
  const emitters =
    `<rect x="10" y="20" width="12" height="14" rx="3" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="58" y="46" width="12" height="14" rx="3" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>`;
  if (!solved) {
    return (
      emitters +
      `<path d="M22 27l46 26M22 24l46 2M22 30l36 23" stroke="${CORAL}" stroke-width="3.5"/>` +
      `<circle cx="22" cy="27" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="58" cy="53" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M12 52h16l-8-14z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M20 43v4" stroke="${INK}" stroke-width="2.5"/>`
    );
  }
  return (
    sparkles(MINT) +
    emitters +
    `<circle cx="40" cy="36" r="11" fill="${MINT}" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M35 36l4 4 7-8" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M22 30c6 10 2 18-6 24" stroke="${INK}" stroke-width="2.5"/>` +
    `<rect x="12" y="54" width="8" height="6" rx="1" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>`
  );
}

function frameLamp(solved: boolean): string {
  const stand =
    `<path d="M26 64h28" stroke="${INK}" stroke-width="3.5"/>` +
    `<rect x="36" y="42" width="8" height="22" fill="${SLATE}" stroke="${INK}" stroke-width="2.5"/>`;
  if (!solved) {
    return (
      stand +
      `<path d="M22 42l8-22h20l8 22z" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="40" cy="44" r="5" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M48 48v8" stroke="${INK}" stroke-width="2.5"/>` +
      `<circle cx="48" cy="57" r="2.5" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>`
    );
  }
  return (
    `<path d="M20 42l-8 20h56l-8-20z" fill="${GOLD}" opacity="0.45"/>` +
    stand +
    `<path d="M22 42l8-22h20l8 22z" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="40" cy="44" r="6" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M40 10v5M20 16l4 4M60 16l-4 4" stroke="${GOLD}" stroke-width="3"/>` +
    sparkles()
  );
}

function frameCrate(solved: boolean): string {
  if (!solved) {
    return (
      `<rect x="16" y="20" width="48" height="46" rx="4" fill="${WOOD}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M22 26h36v34H22z" fill="#E8A96B" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M22 26l36 34M58 26L22 60" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="30" y="38" width="20" height="10" rx="2" fill="${CORAL}" stroke="${INK}" stroke-width="2.5"/>`
    );
  }
  return (
    sparkles() +
    `<path d="M16 32h48v34H16z" fill="${WOOD}" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M14 28l18-12 4 6-18 12z" fill="#E8A96B" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M66 28L48 16l-4 6 18 12z" fill="#E8A96B" stroke="${INK}" stroke-width="3"/>` +
    `<polygon points="40,18 43,26 52,26 45,31 48,39 40,34 32,39 35,31 28,26 37,26" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M24 44h32M24 54h32" stroke="${INK}" stroke-width="2.5"/>`
  );
}

function frameArt(solved: boolean): string {
  if (!solved) {
    return (
      `<g transform="rotate(-7 40 40)">` +
      `<rect x="16" y="16" width="48" height="48" rx="3" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="23" y="23" width="34" height="34" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M26 52l10-14 8 9 5-6 5 11z" fill="${SLATE}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="34" cy="31" r="4" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>` +
      `</g>`
    );
  }
  return (
    sparkles() +
    `<rect x="16" y="16" width="48" height="48" rx="3" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="23" y="23" width="34" height="34" fill="${CREAM}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M25 53l11-16 8 10 6-8 5 14z" fill="${MINT}" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="48" cy="31" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>`
  );
}

function frameCart(solved: boolean): string {
  const wheels =
    `<circle cx="28" cy="60" r="6" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="56" cy="60" r="6" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>`;
  if (!solved) {
    return (
      `<path d="M12 24h10l6 28h36l4-18H25" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="30" y="24" width="26" height="10" rx="2" fill="${SLATE}" stroke="${INK}" stroke-width="2.5"/>` +
      wheels +
      `<path d="M18 65h14l-4-7z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>`
    );
  }
  return (
    `<path d="M6 34h12M4 42h14M8 50h10" stroke="${GOLD}" stroke-width="3"/>` +
    `<path d="M18 24h8l6 28h36l4-18H29" fill="${MINT}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="44" cy="28" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<circle cx="56" cy="29" r="6" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    wheels +
    sparkles()
  );
}

function frameClock(solved: boolean): string {
  const body =
    `<circle cx="40" cy="43" r="21" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M26 62l-4 5M54 62l4 5" stroke="${INK}" stroke-width="3"/>`;
  if (!solved) {
    return (
      `<path d="M18 24l8-8M62 24l-8-8" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="22" cy="20" r="6" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="58" cy="20" r="6" fill="${CORAL}" stroke="${INK}" stroke-width="3"/>` +
      body +
      `<path d="M40 43V30M40 43l10 6" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M10 18c2-4 5-6 5-6M70 18c-2-4-5-6-5-6" stroke="${CORAL}" stroke-width="2.5"/>`
    );
  }
  return (
    `<circle cx="22" cy="21" r="5" fill="${MINT}" stroke="${INK}" stroke-width="2.5"/>` +
    `<circle cx="58" cy="21" r="5" fill="${MINT}" stroke="${INK}" stroke-width="2.5"/>` +
    body +
    `<path d="M30 40c2 2 5 2 7 0M43 40c2 2 5 2 7 0" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M35 50c3 3 7 3 10 0" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M58 14h8l-7 7h8" stroke="${GOLD}" stroke-width="2.5"/>` +
    sparkles(MINT)
  );
}

function frameLocker(solved: boolean): string {
  if (!solved) {
    return (
      `<rect x="20" y="14" width="40" height="54" rx="4" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M28 22h24M28 28h24" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M20 40h40" stroke="${INK}" stroke-width="3" stroke-dasharray="5 4"/>` +
      `<rect x="33" y="38" width="14" height="14" rx="3" fill="${CORAL}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M36 38v-5a4 4 0 0 1 8 0v5" stroke="${INK}" stroke-width="2.5"/>`
    );
  }
  return (
    sparkles(MINT) +
    `<rect x="18" y="14" width="38" height="54" rx="4" fill="${SLATE_DARK}" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="23" y="19" width="28" height="44" fill="#2F3640" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M56 14l14 6v42l-14 6z" fill="${MINT}" stroke="${INK}" stroke-width="3"/>` +
    `<circle cx="37" cy="40" r="7" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>`
  );
}

function frameTrophy(solved: boolean): string {
  if (!solved) {
    return (
      `<rect x="18" y="14" width="44" height="52" rx="4" fill="${CREAM}" opacity="0.7" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M28 24h24v12c0 8-5 13-12 13s-12-5-12-13z" fill="${SLATE}" stroke="${INK}" stroke-width="2.5"/>` +
      `<rect x="34" y="49" width="12" height="9" fill="${SLATE_DARK}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M18 14l44 52M62 14L18 66" stroke="${SLATE}" stroke-width="2" opacity="0.5"/>`
    );
  }
  return (
    sparkles() +
    `<path d="M25 20h30v14c0 9-6 15-15 15s-15-6-15-15z" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M25 24h-7c0 9 3 13 7 13M55 24h7c0 9-3 13-7 13" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="36" y="49" width="8" height="9" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<rect x="27" y="58" width="26" height="8" rx="2" fill="${WOOD}" stroke="${INK}" stroke-width="3"/>`
  );
}

function frameFallback(solved: boolean): string {
  if (!solved) {
    return (
      `<rect x="18" y="20" width="44" height="44" rx="8" fill="${SLATE}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M34 35c0-4 12-4 12 0 0 4-6 5-6 9" stroke="${CREAM}" stroke-width="3.5"/>` +
      `<circle cx="40" cy="52" r="2.5" fill="${CREAM}"/>`
    );
  }
  return (
    sparkles() +
    `<rect x="18" y="20" width="44" height="44" rx="8" fill="${MINT}" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M30 43l7 7 14-16" stroke="${INK}" stroke-width="4"/>`
  );
}

function heroLevel1Lamp(solved: boolean): string {
  // L1 p1: "CLAMP" -> "LAMP" (C-clamp squeezing the desk lamp, then popping off)
  const base = frameLamp(solved);
  if (!solved) {
    return (
      base +
      `<path d="M14 14h22v8H22v18h14v8H14z" fill="${CORAL}" stroke="${INK}" stroke-width="2.8"/>` +
      `<path d="M36 10v10M31 12h10" stroke="${INK}" stroke-width="2.5"/>`
    );
  }
  return (
    base +
    `<g transform="translate(46 4) rotate(22 12 12)">` +
    `<path d="M4 4h14v5H9v10h9v5H4z" fill="${CORAL}" stroke="${INK}" stroke-width="2.5"/>` +
    `</g>` +
    `<path d="M46 28l6-6" stroke="${CORAL}" stroke-width="2.5" stroke-dasharray="3 3"/>`
  );
}

function heroLevel6Locker(solved: boolean): string {
  // L6 p4: "CLAP" -> "CAMP" (noisy rattling locker turns into a cozy mini camp tent!)
  if (!solved) {
    return (
      frameLocker(false) +
      `<path d="M10 24l6 4-6 4M70 24l-6 4 6 4" stroke="${GOLD}" stroke-width="3"/>` +
      `<path d="M12 46l5 3-5 3M68 46l-5 3 5 3" stroke="${CORAL}" stroke-width="3"/>`
    );
  }
  return (
    frameLocker(true) +
    `<path d="M24 58l13-22 13 22z" fill="${CORAL}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M33 58l4-9 4 9z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>`
  );
}

function heroLevel12Art(solved: boolean): string {
  // L12 p2: "RAIN" -> "GAIN" (stormy canvas clears into a golden upward gain chart)
  if (!solved) {
    return (
      frameArt(false) +
      `<path d="M27 29a6 6 0 0 1 11-2 5 5 0 0 1 9 3c0 3-2 4-5 4H30c-3 0-4-2-3-5z" fill="${SLATE}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M31 39l-2 6M38 39l-2 6M45 39l-2 6" stroke="${CORAL}" stroke-width="2.5"/>`
    );
  }
  return (
    frameArt(true) +
    `<path d="M26 50l9-10 6 4 10-14" stroke="${CORAL}" stroke-width="3.5"/>` +
    `<path d="M45 30h6v6" stroke="${CORAL}" stroke-width="3"/>`
  );
}

function heroLevel18Dog(solved: boolean): string {
  // L18 p3: "CORN" -> "ICON" (corn-munching watchdog upgrades to cool shades & gold crown)
  if (!solved) {
    return (
      frameDog(false) +
      `<ellipse cx="55" cy="54" rx="9" ry="5" transform="rotate(-20 55 54)" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M51 54h8M55 50v8" stroke="${INK}" stroke-width="1.5"/>`
    );
  }
  return (
    frameDog(true) +
    `<path d="M29 22l4-8 7 5 7-5 4 8z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
    `<rect x="26" y="36" width="11" height="7" rx="2" fill="${INK}"/>` +
    `<rect x="43" y="36" width="11" height="7" rx="2" fill="${INK}"/>` +
    `<path d="M37 39h6" stroke="${INK}" stroke-width="2.5"/>`
  );
}

const FRAME_RENDERERS: Record<string, (solved: boolean) => string> = {
  safe: frameSafe,
  dog: frameDog,
  laser: frameLaser,
  lamp: frameLamp,
  crate: frameCrate,
  art: frameArt,
  cart: frameCart,
  clock: frameClock,
  locker: frameLocker,
  trophy: frameTrophy,
};

const HERO_GAGS: Record<string, (solved: boolean) => string> = {
  "1:p1": heroLevel1Lamp,
  "6:p4": heroLevel6Locker,
  "12:p2": heroLevel12Art,
  "18:p3": heroLevel18Dog,
};

/**
 * Renders a crisp 80x80 Sunday-comic inline SVG for a prop frame in unsolved or solved state.
 * Campaign levels 1, 6, 12, and 18 include bespoke hero gag overlays on their signature props.
 */
export function renderPropSvg(
  frame: string,
  solved: boolean,
  levelId?: number,
  propId?: string,
): string {
  if (levelId !== undefined && propId !== undefined) {
    const heroRenderer = HERO_GAGS[`${levelId}:${propId}`];
    if (heroRenderer) {
      return wrapSvg(heroRenderer(solved));
    }
  }
  const renderer = FRAME_RENDERERS[frame] ?? frameFallback;
  return wrapSvg(renderer(solved));
}
