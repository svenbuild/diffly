import { buildDictionary, type TokenRow } from './build'
import type { TokenDictionary } from './types'

const REF = 'https://developer.mozilla.org/docs/Web/HTML'

const htmlRows: TokenRow[] = [
  ['html', 'tag', 'The root element of an HTML document. All other elements must be descendants of this element.', 'Element/html'],
  ['head', 'tag', 'Contains machine-readable metadata about the document, such as its title, scripts, and style sheets.', 'Element/head'],
  ['body', 'tag', 'Represents the content of an HTML document. There can be only one body element in a document.', 'Element/body'],
  ['div', 'tag', 'A generic flow container for content. It has no effect on its content until styled with CSS or scripted.', 'Element/div'],
  ['span', 'tag', 'A generic inline container for phrasing content, used to group elements for styling or scripting.', 'Element/span'],
  ['a', 'tag', 'Creates a hyperlink to web pages, files, email addresses, locations in the same page, or anything else a URL can address.', 'Element/a'],
  ['p', 'tag', 'Represents a paragraph of text.', 'Element/p'],
  ['h1', 'tag', 'Represents a section heading. h1 is the highest section level and h6 the lowest.', 'Element/Heading_Elements'],
  ['ul', 'tag', 'Represents an unordered list of items, typically rendered as a bulleted list.', 'Element/ul'],
  ['ol', 'tag', 'Represents an ordered list of items, typically rendered as a numbered list.', 'Element/ol'],
  ['li', 'tag', 'Represents an item in a list. It must be contained in a parent list element.', 'Element/li'],
  ['img', 'tag', 'Embeds an image into the document. The src and alt attributes are required for valid, accessible images.', 'Element/img'],
  ['button', 'tag', 'An interactive element activated by a user that performs an action, such as submitting a form.', 'Element/button'],
  ['input', 'tag', 'Creates interactive controls for web-based forms in order to accept data from the user.', 'Element/input'],
  ['form', 'tag', 'Represents a section containing interactive controls for submitting information.', 'Element/form'],
  ['label', 'tag', 'Represents a caption for an item in a user interface, associating descriptive text with a form control.', 'Element/label'],
  ['table', 'tag', 'Represents tabular data — information presented in a two-dimensional grid of rows and columns.', 'Element/table'],
  ['section', 'tag', 'Represents a generic standalone section of a document that does not have a more specific semantic element.', 'Element/section'],
  ['article', 'tag', 'Represents a self-contained composition intended to be independently distributable or reusable.', 'Element/article'],
  ['nav', 'tag', 'Represents a section whose purpose is to provide navigation links, either within the document or to other pages.', 'Element/nav'],
  ['header', 'tag', 'Represents introductory content, typically a group of introductory or navigational aids.', 'Element/header'],
  ['footer', 'tag', 'Represents a footer for its nearest sectioning content, typically containing authorship or copyright data.', 'Element/footer'],
  ['main', 'tag', 'Represents the dominant content of the body of a document.', 'Element/main'],
  ['script', 'tag', 'Embeds executable code or data, most often JavaScript.', 'Element/script'],
  ['link', 'tag', 'Specifies relationships between the current document and external resources, most commonly style sheets.', 'Element/link'],
  ['meta', 'tag', 'Represents metadata that cannot be expressed by other meta-related elements, such as charset or viewport.', 'Element/meta'],
  ['title', 'tag', 'Defines the document’s title shown in a browser’s title bar or a page’s tab.', 'Element/title'],
  ['select', 'tag', 'Represents a control that provides a menu of options.', 'Element/select'],
  ['option', 'tag', 'Defines an item contained in a select, optgroup, or datalist element.', 'Element/option'],
  ['textarea', 'tag', 'Represents a multi-line plain-text editing control.', 'Element/textarea'],
  ['id', 'attribute', 'A global attribute defining a unique identifier, which must be unique in the whole document.', 'Global_attributes/id'],
  ['class', 'attribute', 'A global attribute, a space-separated list of the case-sensitive classes of the element used by CSS and scripting.', 'Global_attributes/class'],
  ['style', 'attribute', 'A global attribute containing CSS declarations to be applied to the element.', 'Global_attributes/style'],
  ['href', 'attribute', 'On a or link elements, specifies the URL of the page or resource the hyperlink points to.', 'Element/a'],
  ['src', 'attribute', 'On img, script, and similar elements, specifies the URL of the external resource to embed.', 'Element/img'],
  ['alt', 'attribute', 'On img and related elements, provides alternative text describing the resource for accessibility.', 'Element/img'],
  ['type', 'attribute', 'On input and button elements, defines the kind of control or behavior, such as text, checkbox, or submit.', 'Element/input'],
  ['value', 'attribute', 'Specifies the value of a form control, such as the text in an input or the data submitted with a button.', 'Element/input'],
  ['name', 'attribute', 'Names a form control so that its value is submitted with the form data under this key.', 'Element/input'],
  ['data-*', 'attribute', 'A family of global attributes for storing custom data private to the page or application, accessible via the dataset API.', 'Global_attributes/data-*'],
]

export const htmlTokens: TokenDictionary = buildDictionary('MDN', (slug) => `${REF}/${slug}`, htmlRows)
