import type { TokenDictionary, TokenHoverEntry, TokenKind } from './types'

const MDN = 'https://developer.mozilla.org/docs/Web/CSS'

function mdnReference(slug: string) {
  return { label: 'MDN', url: `${MDN}/${slug}` }
}

interface RawEntry {
  kind: TokenKind
  description: string
  syntax?: string
  baseline?: string
  /** Override the MDN slug when it differs from the token text. */
  slug?: string
}

function entry(name: string, raw: RawEntry): TokenHoverEntry {
  return {
    name,
    kind: raw.kind,
    description: raw.description,
    syntax: raw.syntax,
    baseline: raw.baseline,
    reference: mdnReference(raw.slug ?? name),
  }
}

const PROPERTIES: Record<string, RawEntry> = {
  display: {
    kind: 'property',
    description:
      "In combination with 'float' and 'position', determines the type of box or boxes that are generated for an element.",
    syntax:
      'display: [ <display-outside> || <display-inside> ] | <display-listitem> | <display-internal> | <display-box> | <display-legacy>',
    baseline: 'Widely available since Jan 2018',
  },
  position: {
    kind: 'property',
    description:
      'Sets how an element is positioned in a document. The top, right, bottom, and left properties determine the final location of positioned elements.',
    syntax: 'position: static | relative | absolute | sticky | fixed',
    baseline: 'Widely available since Jan 2020',
  },
  flex: {
    kind: 'property',
    description:
      'Sets how a flex item will grow or shrink to fit the space available in its flex container. It is a shorthand for flex-grow, flex-shrink, and flex-basis.',
    syntax: 'flex: none | [ <flex-grow> <flex-shrink>? || <flex-basis> ]',
    baseline: 'Widely available since Jan 2017',
  },
  'flex-direction': {
    kind: 'property',
    description:
      'Sets how flex items are placed in the flex container defining the main axis and the direction (normal or reversed).',
    syntax: 'flex-direction: row | row-reverse | column | column-reverse',
    baseline: 'Widely available since Jan 2017',
  },
  'flex-wrap': {
    kind: 'property',
    description:
      'Sets whether flex items are forced onto one line or can wrap onto multiple lines.',
    syntax: 'flex-wrap: nowrap | wrap | wrap-reverse',
    baseline: 'Widely available since Jan 2017',
  },
  'flex-grow': {
    kind: 'property',
    description: 'Sets the flex grow factor, which specifies how much of the flex container’s remaining space should be assigned to the flex item.',
    syntax: 'flex-grow: <number [0,∞]>',
    baseline: 'Widely available since Jan 2017',
  },
  'flex-basis': {
    kind: 'property',
    description: 'Sets the initial main size of a flex item before free space is distributed according to the flex factors.',
    syntax: 'flex-basis: content | <width>',
    baseline: 'Widely available since Jan 2017',
  },
  'align-items': {
    kind: 'property',
    description:
      'Sets the align-self value on all direct children as a group. In flexbox it controls alignment of items on the cross axis; in grid it controls alignment within the grid area.',
    syntax: 'align-items: normal | stretch | <baseline-position> | [ <overflow-position>? <self-position> ]',
    baseline: 'Widely available since Jan 2020',
  },
  'justify-content': {
    kind: 'property',
    description:
      'Defines how the browser distributes space between and around content items along the main axis of a flex container and the inline axis of a grid container.',
    syntax: 'justify-content: normal | <content-distribution> | [ <overflow-position>? <content-position> ]',
    baseline: 'Widely available since Jan 2020',
  },
  gap: {
    kind: 'property',
    description:
      'Sets the gaps (gutters) between rows and columns. It is a shorthand for row-gap and column-gap.',
    syntax: 'gap: <row-gap> <column-gap>?',
    baseline: 'Widely available since Sep 2020',
  },
  color: {
    kind: 'property',
    description: 'Sets the foreground color value of an element’s text and text decorations.',
    syntax: 'color: <color>',
    baseline: 'Widely available since Jan 2015',
  },
  'background-color': {
    kind: 'property',
    description: 'Sets the background color of an element.',
    syntax: 'background-color: <color>',
    baseline: 'Widely available since Jan 2015',
  },
  background: {
    kind: 'property',
    description: 'Shorthand that sets all background style properties at once, such as color, image, origin, size, and repeat.',
    syntax: 'background: [ <bg-layer> , ]* <final-bg-layer>',
    baseline: 'Widely available since Jan 2015',
  },
  margin: {
    kind: 'property',
    description: 'Sets the margin area on all four sides of an element. It is a shorthand for the four individual margin properties.',
    syntax: 'margin: <length-percentage> | auto {1,4}',
    baseline: 'Widely available since Jan 2015',
  },
  padding: {
    kind: 'property',
    description: 'Sets the padding area on all four sides of an element at once. It is a shorthand for the four individual padding properties.',
    syntax: 'padding: <length-percentage [0,∞]> {1,4}',
    baseline: 'Widely available since Jan 2015',
  },
  border: {
    kind: 'property',
    description: 'Sets an element’s border. It is a shorthand that sets the values of border-width, border-style, and border-color.',
    syntax: 'border: <line-width> || <line-style> || <color>',
    baseline: 'Widely available since Jan 2015',
  },
  'border-radius': {
    kind: 'property',
    description: 'Rounds the corners of an element’s outer border edge. You can set a single radius to make circular corners, or two radii to make elliptical corners.',
    syntax: 'border-radius: <length-percentage [0,∞]> {1,4} [ / <length-percentage [0,∞]> {1,4} ]?',
    baseline: 'Widely available since Jan 2015',
  },
  width: {
    kind: 'property',
    description: 'Sets an element’s width. By default it sets the width of the content area, but with box-sizing: border-box it sets the border area.',
    syntax: 'width: auto | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  height: {
    kind: 'property',
    description: 'Sets an element’s height. By default it sets the height of the content area, but with box-sizing: border-box it sets the border area.',
    syntax: 'height: auto | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  'max-width': {
    kind: 'property',
    description: 'Sets the maximum width of an element, preventing the used value of width from becoming larger than the specified value.',
    syntax: 'max-width: none | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  'min-width': {
    kind: 'property',
    description: 'Sets the minimum width of an element, preventing the used value of width from becoming smaller than the specified value.',
    syntax: 'min-width: auto | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  'max-height': {
    kind: 'property',
    description: 'Sets the maximum height of an element, preventing the used value of height from becoming larger than the specified value.',
    syntax: 'max-height: none | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  'min-height': {
    kind: 'property',
    description: 'Sets the minimum height of an element, preventing the used value of height from becoming smaller than the specified value.',
    syntax: 'min-height: auto | <length-percentage> | min-content | max-content | fit-content',
    baseline: 'Widely available since Jan 2015',
  },
  'font-size': {
    kind: 'property',
    description: 'Sets the size of the font. Changing the font size also updates the sizes of the font size-relative length units such as em and ex.',
    syntax: 'font-size: <absolute-size> | <relative-size> | <length-percentage [0,∞]>',
    baseline: 'Widely available since Jan 2015',
  },
  'font-weight': {
    kind: 'property',
    description: 'Sets the weight (or boldness) of the font. The weights available depend on the font family currently set.',
    syntax: 'font-weight: <font-weight-absolute> | bolder | lighter',
    baseline: 'Widely available since Jan 2015',
  },
  'font-family': {
    kind: 'property',
    description: 'Specifies a prioritized list of one or more font family names and/or generic family names for the selected element.',
    syntax: 'font-family: [ <family-name> | <generic-family> ]#',
    baseline: 'Widely available since Jan 2015',
  },
  'line-height': {
    kind: 'property',
    description: 'Sets the height of a line box. It is commonly used to set the distance between lines of text.',
    syntax: 'line-height: normal | <number> | <length-percentage>',
    baseline: 'Widely available since Jan 2015',
  },
  'text-align': {
    kind: 'property',
    description: 'Sets the horizontal alignment of the inline-level content inside a block element or table-cell box.',
    syntax: 'text-align: start | end | left | right | center | justify | match-parent',
    baseline: 'Widely available since Jan 2015',
  },
  overflow: {
    kind: 'property',
    description: 'Sets the desired behavior when content does not fit in the element’s padding box. It is a shorthand for overflow-x and overflow-y.',
    syntax: 'overflow: [ visible | hidden | clip | scroll | auto ] {1,2}',
    baseline: 'Widely available since Sep 2020',
  },
  opacity: {
    kind: 'property',
    description: 'Sets the opacity of an element, that is, the degree to which the content behind the element is hidden.',
    syntax: 'opacity: <opacity-value>',
    baseline: 'Widely available since Jan 2015',
  },
  transition: {
    kind: 'property',
    description: 'Creates smooth transitions between two states by animating property changes over a duration. It is a shorthand for the transition-* properties.',
    syntax: 'transition: <single-transition>#',
    baseline: 'Widely available since Jan 2015',
  },
  transform: {
    kind: 'property',
    description: 'Lets you rotate, scale, skew, or translate an element by modifying the coordinate space of the CSS visual formatting model.',
    syntax: 'transform: none | <transform-list>',
    baseline: 'Widely available since Jan 2015',
  },
  'box-shadow': {
    kind: 'property',
    description: 'Adds shadow effects around an element’s frame. You can set multiple effects separated by commas.',
    syntax: 'box-shadow: none | <shadow>#',
    baseline: 'Widely available since Jan 2015',
  },
  'box-sizing': {
    kind: 'property',
    description: 'Sets how the total width and height of an element is calculated — whether padding and border are included in those dimensions.',
    syntax: 'box-sizing: content-box | border-box',
    baseline: 'Widely available since Jan 2015',
  },
  cursor: {
    kind: 'property',
    description: 'Sets the mouse cursor, if any, to show when the mouse pointer is over an element.',
    syntax: 'cursor: [ [ <url> [ <x> <y> ]? , ]* [ auto | default | pointer | ... ] ]',
    baseline: 'Widely available since Jan 2015',
  },
  'z-index': {
    kind: 'property',
    description: 'Sets the z-order of a positioned element and its descendants or flex and grid items. Overlapping elements with a larger z-index cover those with a smaller one.',
    syntax: 'z-index: auto | <integer>',
    baseline: 'Widely available since Jan 2015',
  },
  'grid-template-columns': {
    kind: 'property',
    description: 'Defines the line names and track sizing functions of the grid columns.',
    syntax: 'grid-template-columns: none | <track-list> | <auto-track-list> | subgrid',
    baseline: 'Widely available since Jan 2020',
  },
  'grid-template-rows': {
    kind: 'property',
    description: 'Defines the line names and track sizing functions of the grid rows.',
    syntax: 'grid-template-rows: none | <track-list> | <auto-track-list> | subgrid',
    baseline: 'Widely available since Jan 2020',
  },
  'object-fit': {
    kind: 'property',
    description: 'Sets how the content of a replaced element, such as an img or video, should be resized to fit its container.',
    syntax: 'object-fit: fill | contain | cover | none | scale-down',
    baseline: 'Widely available since Sep 2020',
  },
  inset: {
    kind: 'property',
    description: 'A shorthand that corresponds to the top, right, bottom, and/or left properties. It has the same multi-value syntax as the margin shorthand.',
    syntax: 'inset: <length-percentage> | auto {1,4}',
    baseline: 'Widely available since Aug 2021',
  },
  'aspect-ratio': {
    kind: 'property',
    description: 'Sets a preferred aspect ratio for the box, which will be used in the calculation of auto sizes and some other layout functions.',
    syntax: 'aspect-ratio: auto || <ratio>',
    baseline: 'Widely available since Sep 2021',
  },
}

const AT_RULES: Record<string, RawEntry> = {
  '@media': {
    kind: 'at-rule',
    description: 'Applies part of a style sheet based on the result of one or more media queries, testing a device’s type, dimensions, and other characteristics.',
    syntax: '@media <media-query-list> { <rule-list> }',
    baseline: 'Widely available since Jan 2015',
    slug: '@media',
  },
  '@supports': {
    kind: 'at-rule',
    description: 'Lets you specify CSS declarations that depend on a browser’s support for CSS features (feature queries).',
    syntax: '@supports <supports-condition> { <rule-list> }',
    baseline: 'Widely available since Jan 2017',
    slug: '@supports',
  },
  '@keyframes': {
    kind: 'at-rule',
    description: 'Controls the intermediate steps in a CSS animation sequence by defining styles for keyframes along the animation.',
    syntax: '@keyframes <keyframes-name> { <keyframe-block-list> }',
    baseline: 'Widely available since Jan 2015',
    slug: '@keyframes',
  },
  '@import': {
    kind: 'at-rule',
    description: 'Imports style rules from other valid style sheets. It must precede all other rules except @charset and @layer statements.',
    syntax: '@import [ <url> | <string> ] <import-conditions> ;',
    baseline: 'Widely available since Jan 2015',
    slug: '@import',
  },
  '@font-face': {
    kind: 'at-rule',
    description: 'Specifies a custom font with which to display text, loaded from either a remote server or a locally installed font.',
    syntax: '@font-face { <declaration-list> }',
    baseline: 'Widely available since Jan 2015',
    slug: '@font-face',
  },
  '@layer': {
    kind: 'at-rule',
    description: 'Declares a cascade layer and can also set the order of precedence when there are multiple cascade layers.',
    syntax: '@layer <layer-name># ; | @layer <layer-name>? { <rule-list> }',
    baseline: 'Widely available since Mar 2022',
    slug: '@layer',
  },
  '@container': {
    kind: 'at-rule',
    description: 'A conditional group rule that applies styles based on the size or style of a query container rather than the viewport.',
    syntax: '@container <container-condition># { <rule-list> }',
    baseline: 'Widely available since Feb 2023',
    slug: '@container',
  },
}

const PSEUDOS: Record<string, RawEntry> = {
  ':hover': {
    kind: 'pseudo',
    description: 'Matches when the user designates an element with a pointing device, but does not necessarily activate it. It is generally triggered when the cursor hovers over an element.',
    syntax: ':hover',
    baseline: 'Widely available since Jan 2015',
    slug: ':hover',
  },
  ':focus': {
    kind: 'pseudo',
    description: 'Represents an element (such as a form input) that has received focus. It is generally triggered when the user clicks or taps an element or selects it with the Tab key.',
    syntax: ':focus',
    baseline: 'Widely available since Jan 2015',
    slug: ':focus',
  },
  ':focus-visible': {
    kind: 'pseudo',
    description: 'Matches an element while it is focused and the browser determines via heuristics that the focus should be made visible, such as when navigating with the keyboard.',
    syntax: ':focus-visible',
    baseline: 'Widely available since Mar 2022',
    slug: ':focus-visible',
  },
  ':active': {
    kind: 'pseudo',
    description: 'Represents an element that is being activated by the user, such as the moment a button is being pressed before it is released.',
    syntax: ':active',
    baseline: 'Widely available since Jan 2015',
    slug: ':active',
  },
  ':first-child': {
    kind: 'pseudo',
    description: 'Represents the first element among a group of sibling elements.',
    syntax: ':first-child',
    baseline: 'Widely available since Jan 2015',
    slug: ':first-child',
  },
  ':last-child': {
    kind: 'pseudo',
    description: 'Represents the last element among a group of sibling elements.',
    syntax: ':last-child',
    baseline: 'Widely available since Jan 2015',
    slug: ':last-child',
  },
  ':nth-child': {
    kind: 'pseudo',
    description: 'Matches elements based on their position among a group of siblings, using a counting expression such as 2n, odd, or 3n+1.',
    syntax: ':nth-child( <nth> [ of <complex-selector-list> ]? )',
    baseline: 'Widely available since Jan 2015',
    slug: ':nth-child',
  },
  ':not': {
    kind: 'pseudo',
    description: 'Represents elements that do not match a list of selectors. It is also known as the negation pseudo-class.',
    syntax: ':not( <complex-selector-list> )',
    baseline: 'Widely available since Jan 2015',
    slug: ':not',
  },
  ':root': {
    kind: 'pseudo',
    description: 'Matches the root element of a tree representing the document. In HTML this is the <html> element and is often used to declare custom properties.',
    syntax: ':root',
    baseline: 'Widely available since Jan 2015',
    slug: ':root',
  },
  '::before': {
    kind: 'pseudo',
    description: 'Creates a pseudo-element that is the first child of the selected element. It is often used to add cosmetic content with the content property.',
    syntax: '::before',
    baseline: 'Widely available since Jan 2015',
    slug: '::before',
  },
  '::after': {
    kind: 'pseudo',
    description: 'Creates a pseudo-element that is the last child of the selected element. It is often used to add cosmetic content with the content property.',
    syntax: '::after',
    baseline: 'Widely available since Jan 2015',
    slug: '::after',
  },
}

function buildDictionary(): TokenDictionary {
  const dictionary: TokenDictionary = {}
  const add = (groups: Record<string, RawEntry>) => {
    for (const [name, raw] of Object.entries(groups)) {
      dictionary[name] = entry(name, raw)
    }
  }
  add(PROPERTIES)
  add(AT_RULES)
  add(PSEUDOS)
  return dictionary
}

export const cssTokens: TokenDictionary = buildDictionary()
