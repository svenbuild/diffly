import { buildDictionary, type TokenRow } from './build'
import type { TokenDictionary } from './types'

const REF = 'https://en.cppreference.com/w/c'

// Exported so the C++ dictionary can re-use this common C subset.
export const cRows: TokenRow[] = [
  ['int', 'type', 'The basic signed integer type. Its width is at least 16 bits and is commonly 32 bits.', 'language/arithmetic_types'],
  ['char', 'type', 'The character type, the smallest addressable unit. It is at least 8 bits and holds one byte.', 'language/arithmetic_types'],
  ['float', 'type', 'A single-precision floating-point type, usually following the IEEE-754 binary32 format.', 'language/arithmetic_types'],
  ['double', 'type', 'A double-precision floating-point type, usually following the IEEE-754 binary64 format.', 'language/arithmetic_types'],
  ['void', 'type', 'An incomplete type used to indicate the absence of a value or, with pointers, an untyped address.', 'language/type'],
  ['short', 'type', 'A signed integer type that is at least 16 bits wide and no wider than int.', 'language/arithmetic_types'],
  ['long', 'type', 'A signed integer type that is at least 32 bits wide and no narrower than int.', 'language/arithmetic_types'],
  ['unsigned', 'type', 'A modifier producing an integer type that represents only non-negative values, with wraparound on overflow.', 'language/arithmetic_types'],
  ['signed', 'type', 'A modifier producing an integer type that can represent negative values. This is the default for int and char in most contexts.', 'language/arithmetic_types'],
  ['struct', 'keyword', 'Defines a structure type that groups several named members, possibly of different types, into one unit.', 'language/struct'],
  ['union', 'keyword', 'Defines a type whose members share the same memory, so it holds at most one of its members at a time.', 'language/union'],
  ['enum', 'keyword', 'Defines an enumeration type — a distinct integer type whose values are restricted to a set of named constants.', 'language/enum'],
  ['typedef', 'keyword', 'Creates an alias name for an existing type, often used to simplify complex declarations.', 'language/typedef'],
  ['const', 'keyword', 'A type qualifier marking an object as read-only after initialization; modifying it is undefined behavior.', 'language/const'],
  ['static', 'keyword', 'Gives a variable static storage duration or limits a declaration’s linkage to its translation unit.', 'language/storage_duration'],
  ['extern', 'keyword', 'Declares an identifier with external linkage, referring to a definition provided in another translation unit.', 'language/storage_duration'],
  ['volatile', 'keyword', 'A type qualifier indicating that an object may change in ways the compiler cannot predict, disabling certain optimizations.', 'language/volatile'],
  ['sizeof', 'keyword', 'An operator that yields the size, in bytes, of its operand’s type.', 'language/sizeof'],
  ['return', 'keyword', 'Ends execution of the current function and optionally returns a value to the caller.', 'language/return'],
  ['if', 'keyword', 'Executes a statement conditionally based on whether an expression is nonzero.', 'language/if'],
  ['else', 'keyword', 'Provides the statement executed when an if condition is zero.', 'language/if'],
  ['for', 'keyword', 'A loop with initialization, condition, and iteration expressions controlling repeated execution.', 'language/for'],
  ['while', 'keyword', 'Repeatedly executes its body as long as the controlling expression is nonzero.', 'language/while'],
  ['do', 'keyword', 'Begins a do-while loop, which executes its body once before testing the condition.', 'language/do'],
  ['switch', 'keyword', 'Transfers control to one of several statements depending on the value of an integer expression.', 'language/switch'],
  ['case', 'keyword', 'Labels a statement within a switch as a target for a particular constant value.', 'language/switch'],
  ['break', 'keyword', 'Terminates the nearest enclosing loop or switch statement.', 'language/break'],
  ['continue', 'keyword', 'Skips to the next iteration of the nearest enclosing loop.', 'language/continue'],
  ['goto', 'keyword', 'Transfers control unconditionally to a labeled statement in the same function.', 'language/goto'],
  ['NULL', 'macro', 'A macro expanding to an implementation-defined null pointer constant.', 'types/NULL'],
  ['printf', 'function', 'Writes formatted output to the standard output stream, interpreting a format string and variadic arguments.', 'io/fprintf'],
  ['scanf', 'function', 'Reads formatted input from the standard input stream according to a format string.', 'io/fscanf'],
  ['malloc', 'function', 'Allocates a block of uninitialized memory of the given size and returns a pointer to it, or NULL on failure.', 'memory/malloc'],
  ['free', 'function', 'Deallocates a block of memory previously allocated by malloc, calloc, or realloc.', 'memory/free'],
  ['memcpy', 'function', 'Copies a number of bytes from a source object to a non-overlapping destination object.', 'string/byte/memcpy'],
  ['strlen', 'function', 'Returns the length of a null-terminated byte string, not counting the terminating null character.', 'string/byte/strlen'],
  ['strcmp', 'function', 'Compares two null-terminated byte strings lexicographically and returns their ordering.', 'string/byte/strcmp'],
  ['size_t', 'type', 'The unsigned integer type returned by the sizeof operator, used for object sizes and array indices.', 'types/size_t'],
]

export const cTokens: TokenDictionary = buildDictionary('cppreference', (slug) => `${REF}/${slug}`, cRows)
