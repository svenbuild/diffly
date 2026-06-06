import { buildDictionary, type TokenRow } from './build'
import { javascriptTokens } from './javascript'
import type { TokenDictionary } from './types'

const HANDBOOK = 'https://www.typescriptlang.org/docs/handbook/2'

// TypeScript-only keywords layered on top of the shared JavaScript dictionary.
const typescriptRows: TokenRow[] = [
  ['interface', 'keyword', 'Declares a named object type describing the shape of a value — its properties and their types — without generating any runtime code.', 'objects.html'],
  ['type', 'keyword', 'Declares a type alias, giving a name to any type including unions, intersections, primitives, and object shapes.', 'everyday-types.html'],
  ['enum', 'keyword', 'Defines a named set of constants, allowing a variable to be one of a fixed set of values. Enums emit runtime code.', '../enums.html'],
  ['namespace', 'keyword', 'Groups related code under a named scope. A largely legacy feature; ES modules are preferred for new code.', '../namespaces.html'],
  ['implements', 'keyword', 'Declares that a class conforms to one or more interfaces, enforcing their shape at compile time.', 'classes.html'],
  ['abstract', 'keyword', 'Marks a class or member that cannot be instantiated directly and must be implemented by a subclass.', 'classes.html'],
  ['readonly', 'keyword', 'Marks a property as immutable after initialization, preventing reassignment outside the constructor.', 'objects.html'],
  ['public', 'keyword', 'Marks a class member as accessible from anywhere. This is the default visibility for members.', 'classes.html'],
  ['private', 'keyword', 'Marks a class member as accessible only from within the declaring class.', 'classes.html'],
  ['protected', 'keyword', 'Marks a class member as accessible within the declaring class and its subclasses.', 'classes.html'],
  ['declare', 'keyword', 'Describes the type of an entity that exists elsewhere (ambient declaration) without emitting any code for it.', '../declaration-files/introduction.html'],
  ['as', 'keyword', 'A type assertion that tells the compiler to treat a value as a specific type, overriding its inferred type.', 'everyday-types.html'],
  ['keyof', 'keyword', 'A type operator that produces a union of the known, public property names of a given type.', 'keyof-types.html'],
  ['infer', 'keyword', 'Declares a type variable to be inferred within the extends clause of a conditional type.', 'conditional-types.html'],
  ['satisfies', 'keyword', 'Checks that an expression matches a type without changing the expression’s inferred type.', 'everyday-types.html'],
  ['unknown', 'type', 'The type-safe counterpart of any: any value is assignable to unknown, but it must be narrowed before use.', 'everyday-types.html'],
  ['never', 'type', 'Represents values that never occur — for example the return type of a function that always throws.', 'narrowing.html'],
  ['any', 'type', 'Opts a value out of type checking, allowing any operation. Use sparingly as it disables type safety.', 'everyday-types.html'],
  ['string', 'type', 'The primitive type for textual data.', 'everyday-types.html'],
  ['number', 'type', 'The primitive type for numeric values, covering both integers and floating-point numbers.', 'everyday-types.html'],
  ['boolean', 'type', 'The primitive type with the two values true and false.', 'everyday-types.html'],
]

const typescriptOnlyTokens = buildDictionary('TypeScript', (slug) => `${HANDBOOK}/${slug}`, typescriptRows)

export const typescriptTokens: TokenDictionary = {
  ...javascriptTokens,
  ...typescriptOnlyTokens,
}
