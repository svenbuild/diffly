import { buildDictionary, type TokenRow } from './build'
import type { TokenDictionary } from './types'

const REF = 'https://docs.python.org/3'
const COMPOUND = 'reference/compound_stmts.html'
const SIMPLE = 'reference/simple_stmts.html'
const FUNCS = 'library/functions.html'

const pythonRows: TokenRow[] = [
  ['def', 'keyword', 'Defines a function, binding a name to a callable object created from the following block.', `${COMPOUND}#function-definitions`],
  ['class', 'keyword', 'Defines a class, a template for creating objects that bundle data and behavior.', `${COMPOUND}#class-definitions`],
  ['return', 'keyword', 'Leaves the current function, optionally passing an expression back to the caller.', `${SIMPLE}#the-return-statement`],
  ['if', 'keyword', 'Executes a block conditionally based on the truth value of an expression.', `${COMPOUND}#the-if-statement`],
  ['elif', 'keyword', 'Provides an additional condition tested when previous if/elif conditions were false.', `${COMPOUND}#the-if-statement`],
  ['else', 'keyword', 'Specifies a block to run when an if, loop, or try completes without taking the primary branch.', `${COMPOUND}#the-if-statement`],
  ['for', 'keyword', 'Iterates over the items of any iterable object, such as a list, tuple, or generator.', `${COMPOUND}#the-for-statement`],
  ['while', 'keyword', 'Repeatedly executes a block as long as a condition remains true.', `${COMPOUND}#the-while-statement`],
  ['break', 'keyword', 'Terminates the nearest enclosing for or while loop.', `${SIMPLE}#the-break-statement`],
  ['continue', 'keyword', 'Continues with the next cycle of the nearest enclosing loop.', `${SIMPLE}#the-continue-statement`],
  ['import', 'keyword', 'Loads a module and binds its name (or selected names) in the current namespace.', `${SIMPLE}#the-import-statement`],
  ['from', 'keyword', 'Used with import to bring specific names from a module directly into the current namespace.', `${SIMPLE}#the-import-statement`],
  ['as', 'keyword', 'Binds an imported name, context manager, or exception to an alias.', `${SIMPLE}#the-import-statement`],
  ['try', 'keyword', 'Wraps a block whose exceptions are handled by associated except or finally clauses.', `${COMPOUND}#the-try-statement`],
  ['except', 'keyword', 'Catches and handles exceptions of a specified type raised within the associated try block.', `${COMPOUND}#the-try-statement`],
  ['finally', 'keyword', 'Defines a block that always runs as a try statement is left, used for cleanup.', `${COMPOUND}#the-try-statement`],
  ['raise', 'keyword', 'Raises an exception, interrupting normal flow until it is caught or terminates the program.', `${SIMPLE}#the-raise-statement`],
  ['with', 'keyword', 'Wraps a block with a context manager, guaranteeing setup and cleanup actions such as closing a file.', `${COMPOUND}#the-with-statement`],
  ['lambda', 'keyword', 'Creates a small anonymous function consisting of a single expression.', 'reference/expressions.html#lambda'],
  ['yield', 'keyword', 'Suspends a generator function, returning a value and resuming where it left off when next iterated.', 'reference/expressions.html#yield-expressions'],
  ['async', 'keyword', 'Declares a coroutine function or asynchronous loop/context, enabling cooperative concurrency.', `${COMPOUND}#coroutines`],
  ['await', 'keyword', 'Suspends a coroutine until the awaited awaitable completes, yielding control to the event loop.', 'reference/expressions.html#await-expression'],
  ['global', 'keyword', 'Declares that names refer to variables in the module-level (global) namespace.', `${SIMPLE}#the-global-statement`],
  ['nonlocal', 'keyword', 'Declares that names refer to variables in the nearest enclosing function scope.', `${SIMPLE}#the-nonlocal-statement`],
  ['pass', 'keyword', 'A null statement that does nothing, used where a statement is syntactically required.', `${SIMPLE}#the-pass-statement`],
  ['del', 'keyword', 'Removes a name binding from the namespace, or deletes an item or slice from a container.', `${SIMPLE}#the-del-statement`],
  ['in', 'keyword', 'Tests membership in a container, or names the iterable in a for loop.', 'reference/expressions.html#membership-test-operations'],
  ['not', 'keyword', 'A boolean operator that inverts the truth value of its operand.', 'reference/expressions.html#boolean-operations'],
  ['and', 'keyword', 'A short-circuiting boolean operator returning the first falsy operand or the last operand.', 'reference/expressions.html#boolean-operations'],
  ['or', 'keyword', 'A short-circuiting boolean operator returning the first truthy operand or the last operand.', 'reference/expressions.html#boolean-operations'],
  ['None', 'constant', 'The sole value of the NoneType type, representing the absence of a value.', 'library/constants.html#None'],
  ['True', 'constant', 'The boolean true value; an instance of the bool type.', 'library/constants.html#True'],
  ['False', 'constant', 'The boolean false value; an instance of the bool type.', 'library/constants.html#False'],
  ['self', 'keyword', 'By convention, the first parameter of instance methods, referring to the instance being operated on.', `${COMPOUND}#class-definitions`],
  ['print', 'function', 'Writes objects to a text stream (standard output by default), separated by spaces and ended by a newline.', `${FUNCS}#print`],
  ['len', 'function', 'Returns the number of items in a container such as a string, list, tuple, or dictionary.', `${FUNCS}#len`],
  ['range', 'function', 'Returns an immutable sequence of integers, commonly used to drive for loops.', `${FUNCS}#func-range`],
  ['list', 'type', 'The built-in mutable sequence type, and a constructor that builds a list from an iterable.', `${FUNCS}#func-list`],
  ['dict', 'type', 'The built-in mapping type associating keys with values, and its constructor.', `${FUNCS}#func-dict`],
  ['str', 'type', 'The built-in immutable text sequence type, and a constructor that returns a string version of an object.', `${FUNCS}#func-str`],
  ['int', 'type', 'The built-in integer type, and a constructor that converts numbers or strings to an integer.', `${FUNCS}#int`],
]

export const pythonTokens: TokenDictionary = buildDictionary('Python docs', (slug) => `${REF}/${slug}`, pythonRows)
