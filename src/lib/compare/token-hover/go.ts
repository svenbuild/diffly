import { buildDictionary, type TokenRow } from './build'
import type { TokenDictionary } from './types'

const SPEC = 'go.dev/ref/spec'
const BUILTIN = 'pkg.go.dev/builtin'

const goRows: TokenRow[] = [
  ['func', 'keyword', 'Declares a function or method, or a function literal. Functions are first-class values in Go.', `${SPEC}#Function_declarations`],
  ['var', 'keyword', 'Declares one or more variables, optionally with explicit types and initial values.', `${SPEC}#Variable_declarations`],
  ['const', 'keyword', 'Declares named constant values evaluated at compile time.', `${SPEC}#Constant_declarations`],
  ['type', 'keyword', 'Declares a new named type or a type alias.', `${SPEC}#Type_declarations`],
  ['struct', 'keyword', 'Defines a composite type that groups together named fields, each with a type.', `${SPEC}#Struct_types`],
  ['interface', 'keyword', 'Defines a set of method signatures; any type implementing them satisfies the interface implicitly.', `${SPEC}#Interface_types`],
  ['map', 'keyword', 'Declares an unordered collection type associating keys of one type with values of another.', `${SPEC}#Map_types`],
  ['chan', 'keyword', 'Declares a channel, a typed conduit through which goroutines communicate and synchronize.', `${SPEC}#Channel_types`],
  ['package', 'keyword', 'Declares the package to which a source file belongs; every Go file begins with one.', `${SPEC}#Package_clause`],
  ['import', 'keyword', 'Makes the exported identifiers of another package available in the current file.', `${SPEC}#Import_declarations`],
  ['return', 'keyword', 'Terminates the enclosing function and optionally provides one or more result values.', `${SPEC}#Return_statements`],
  ['if', 'keyword', 'Executes a branch conditionally, optionally with a short statement evaluated first.', `${SPEC}#If_statements`],
  ['else', 'keyword', 'Specifies the branch executed when the if condition is false.', `${SPEC}#If_statements`],
  ['for', 'keyword', 'Go’s only loop construct, covering counted loops, condition loops, infinite loops, and range loops.', `${SPEC}#For_statements`],
  ['range', 'keyword', 'Iterates over elements of arrays, slices, strings, maps, or channels in a for loop.', `${SPEC}#For_statements`],
  ['switch', 'keyword', 'Selects a branch by comparing a value, or by type, against a series of cases.', `${SPEC}#Switch_statements`],
  ['case', 'keyword', 'Labels a branch within a switch or select statement.', `${SPEC}#Switch_statements`],
  ['default', 'keyword', 'The branch of a switch or select executed when no other case matches.', `${SPEC}#Switch_statements`],
  ['break', 'keyword', 'Terminates the innermost for, switch, or select statement.', `${SPEC}#Break_statements`],
  ['continue', 'keyword', 'Begins the next iteration of the innermost for loop.', `${SPEC}#Continue_statements`],
  ['go', 'keyword', 'Starts the execution of a function call as an independent, concurrent goroutine.', `${SPEC}#Go_statements`],
  ['defer', 'keyword', 'Schedules a function call to run after the surrounding function returns, used for cleanup.', `${SPEC}#Defer_statements`],
  ['select', 'keyword', 'Waits on multiple channel operations, proceeding with whichever is ready first.', `${SPEC}#Select_statements`],
  ['goroutine', 'keyword', 'A lightweight thread of execution managed by the Go runtime, started with the go keyword.', `${SPEC}#Go_statements`],
  ['string', 'type', 'The built-in type for immutable sequences of bytes, conventionally holding UTF-8 text.', `${SPEC}#String_types`],
  ['int', 'type', 'A signed integer type that is either 32 or 64 bits wide depending on the platform.', `${SPEC}#Numeric_types`],
  ['bool', 'type', 'The built-in boolean type with the predeclared constants true and false.', `${SPEC}#Boolean_types`],
  ['byte', 'type', 'An alias for uint8, used when working with raw bytes of data.', `${SPEC}#Numeric_types`],
  ['rune', 'type', 'An alias for int32 representing a Unicode code point.', `${SPEC}#Numeric_types`],
  ['error', 'type', 'The built-in interface type for representing error conditions, with a single Error string method.', `${BUILTIN}#error`],
  ['nil', 'constant', 'The predeclared zero value for pointers, interfaces, maps, slices, channels, and functions.', `${BUILTIN}#pkg-constants`],
  ['true', 'constant', 'The predeclared boolean constant representing truth.', `${BUILTIN}#pkg-constants`],
  ['false', 'constant', 'The predeclared boolean constant representing falsehood.', `${BUILTIN}#pkg-constants`],
  ['make', 'function', 'A built-in that allocates and initializes slices, maps, and channels, returning a ready-to-use value.', `${BUILTIN}#make`],
  ['new', 'function', 'A built-in that allocates zeroed storage for a type and returns a pointer to it.', `${BUILTIN}#new`],
  ['len', 'function', 'A built-in returning the length of a string, array, slice, map, or channel.', `${BUILTIN}#len`],
  ['cap', 'function', 'A built-in returning the capacity of a slice, array, or channel.', `${BUILTIN}#cap`],
  ['append', 'function', 'A built-in that appends elements to the end of a slice, returning the possibly-reallocated result.', `${BUILTIN}#append`],
  ['panic', 'function', 'A built-in that stops normal execution and begins unwinding the stack, running deferred calls.', `${BUILTIN}#panic`],
  ['recover', 'function', 'A built-in that regains control of a panicking goroutine, used inside deferred functions.', `${BUILTIN}#recover`],
]

export const goTokens: TokenDictionary = buildDictionary('Go docs', (slug) => `https://${slug}`, goRows)
