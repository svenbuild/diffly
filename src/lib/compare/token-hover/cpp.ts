import { buildDictionary, type TokenRow } from './build'
import { cRows } from './c'
import type { TokenDictionary } from './types'

const REF = 'https://en.cppreference.com/w/cpp'

// C++-specific tokens layered on top of the shared C subset.
const cppRows: TokenRow[] = [
  ['class', 'keyword', 'Defines a class type whose members are private by default, bundling data and the functions that operate on it.', 'language/class'],
  ['public', 'keyword', 'An access specifier making subsequent class members accessible from any code.', 'language/access'],
  ['private', 'keyword', 'An access specifier making subsequent class members accessible only within the class and its friends.', 'language/access'],
  ['protected', 'keyword', 'An access specifier making members accessible within the class, its friends, and derived classes.', 'language/access'],
  ['virtual', 'keyword', 'Declares a member function that can be overridden in derived classes and dispatched dynamically through a base pointer.', 'language/virtual'],
  ['override', 'keyword', 'Specifies that a virtual function overrides one from a base class, causing a compile error if it does not.', 'language/override'],
  ['template', 'keyword', 'Defines a family of classes or functions parameterized by types or values, instantiated as needed.', 'language/templates'],
  ['typename', 'keyword', 'Introduces a template type parameter, or disambiguates a dependent name as a type within a template.', 'language/dependent_name'],
  ['namespace', 'keyword', 'Declares a named scope that groups related declarations to prevent name collisions.', 'language/namespace'],
  ['using', 'keyword', 'Introduces a name into the current scope, creates a type alias, or brings namespace members into scope.', 'language/namespace'],
  ['new', 'keyword', 'Allocates and constructs an object with dynamic storage duration, returning a pointer to it.', 'language/new'],
  ['delete', 'keyword', 'Destroys an object created by new and releases its memory, or marks a special member function as deleted.', 'language/delete'],
  ['this', 'keyword', 'A prvalue pointer to the object on which a non-static member function is invoked.', 'language/this'],
  ['operator', 'keyword', 'Introduces an operator overload or a user-defined conversion function within a class.', 'language/operators'],
  ['constexpr', 'keyword', 'Declares that the value of a variable or function can be evaluated at compile time.', 'language/constexpr'],
  ['noexcept', 'keyword', 'Specifies that a function does not throw exceptions, or queries whether an expression is non-throwing.', 'language/noexcept_spec'],
  ['friend', 'keyword', 'Grants a function or class access to the private and protected members of the declaring class.', 'language/friend'],
  ['nullptr', 'constant', 'The null pointer literal of type std::nullptr_t, a type-safe replacement for the NULL macro.', 'language/nullptr'],
  ['bool', 'type', 'The boolean type, holding one of the values true or false.', 'language/types'],
  ['auto', 'keyword', 'Deduces the type of a variable from its initializer, or specifies a trailing return type.', 'language/auto'],
  ['std', 'type', 'The namespace in which the entire C++ Standard Library is declared.', 'std'],
  ['string', 'type', 'std::string — a class managing a dynamically sized sequence of characters.', 'string/basic_string'],
  ['vector', 'type', 'std::vector — a sequence container that encapsulates a dynamically sized contiguous array.', 'container/vector'],
  ['map', 'type', 'std::map — a sorted associative container mapping unique keys to values, typically a balanced tree.', 'container/map'],
  ['cout', 'function', 'std::cout — the standard output stream object, written to with the << insertion operator.', 'io/cout'],
]

const cppOnlyTokens = buildDictionary('cppreference', (slug) => `${REF}/${slug}`, cppRows)
const cSubsetTokens = buildDictionary('cppreference', (slug) => `https://en.cppreference.com/w/c/${slug}`, cRows)

export const cppTokens: TokenDictionary = {
  ...cSubsetTokens,
  ...cppOnlyTokens,
}
