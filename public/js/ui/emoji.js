// SPDX-License-Identifier: MIT
// Fluent UI Emoji icons served locally as <img>. Slugs match the SVG
// filenames under /icons/emoji/.

const BASE = '/icons/emoji';

// All bundled slugs, alphabetically sorted. Used by the admin form datalist
// for autocomplete; the deck JSON and the renderer accept any matching slug.
export const EMOJI_SLUGS = [
  'amphora', 'artist-palette', 'automobile', 'axe', 'baguette-bread',
  'balance-scale', 'basket', 'bathtub', 'bed', 'beer-mug', 'bicycle', 'bikini',
  'books', 'bottle-with-popping-cork', 'bowl-with-spoon', 'bowling', 'broom',
  'bullseye', 'camera', 'camera-with-flash', 'candle', 'carrot', 'chains',
  'chair', 'chess-pawn', 'chocolate-bar', 'city', 'clapper-board',
  'classical-building', 'clown-face', 'cocktail-glass', 'coin',
  'couple-with-heart', 'croissant', 'crown', 'crystal-ball', 'deciduous-tree',
  'dress', 'envelope', 'evergreen-tree', 'eyes', 'feather', 'flag-in-hole',
  'foot', 'fork-and-knife', 'fork-and-knife-with-plate', 'framed-picture',
  'game-die', 'ghost', 'graduation-cap', 'grapes', 'growing-heart', 'guitar',
  'hamburger', 'hammer', 'headphone', 'heart-arrow', 'heart-ribbon',
  'hiking-boot', 'hot-beverage', 'hot-dog', 'hot-springs', 'hourglass-done',
  'house', 'joker', 'joystick', 'kiss-mark', 'kitchen-knife', 'lipstick',
  'love-letter', 'magnifying-glass-tilted-left', 'man-cook', 'microphone',
  'microscope', 'money-bag', 'monkey', 'musical-notes', 'no-mobile-phones',
  'old-key', 'open-book', 'oyster', 'p-button', 'package', 'paintbrush',
  'pancakes', 'peach', 'performing-arts', 'person-climbing',
  'person-getting-massage', 'person-in-lotus-position',
  'person-in-steamy-room', 'person-rowing-boat', 'pizza', 'popcorn',
  'potted-plant', 'puzzle-piece', 'racing-car', 'red-heart',
  'red-question-mark', 'rolling-on-the-floor-laughing', 'scissors',
  'see-no-evil-monkey', 'selfie', 'shallow-pan-of-food', 'shopping-bags',
  'shortcake', 'shushing-face', 'sleeping-face', 'soccer-ball',
  'soft-ice-cream', 'spaghetti', 'sparkling-heart', 'speech-balloon',
  'speedboat', 'strawberry', 'sunrise', 't-shirt', 'takeout-box',
  'teacup-without-handle', 'thinking-face', 'thumbs-up', 'tropical-drink',
  'tropical-fish', 'tumbler-glass', 'two-hearts', 'video-game',
  'water-pistol', 'water-wave', 'wine-glass', 'woman-dancing', 'world-map',
  'wrapped-gift', 'writing-hand', 'zipper-mouth-face',
];

export const HEART_KEYS = [
  'heart-ribbon',
  'growing-heart',
  'sparkling-heart',
  'two-hearts',
  'heart-arrow',
  'red-heart',
];

export function emojiUrl(slug) {
  return slug ? `${BASE}/${slug}.svg` : '';
}

export function emojiImgHTML(slug, alt = '') {
  const url = emojiUrl(slug);
  if (!url) return '';
  return `<img class="emoji" src="${url}" alt="${alt}" draggable="false">`;
}

export function createEmojiImg(slug, alt = '') {
  const img = document.createElement('img');
  img.className = 'emoji';
  img.src = emojiUrl(slug);
  img.alt = alt;
  img.draggable = false;
  return img;
}
