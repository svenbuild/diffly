import { buildDictionary, type TokenRow } from './build'
import type { TokenDictionary } from './types'

const ORACLE = 'https://docs.oracle.com'
const KEYWORDS = 'javase/tutorial/java/nutsandbolts/_keywords.html'
const LANG = 'en/java/javase/21/docs/api/java.base/java/lang'

const javaRows: TokenRow[] = [
  ['public', 'keyword', 'An access modifier making a class or member accessible from any other class.', KEYWORDS],
  ['private', 'keyword', 'An access modifier making a member accessible only within its own class.', KEYWORDS],
  ['protected', 'keyword', 'An access modifier making a member accessible within its package and by subclasses.', KEYWORDS],
  ['class', 'keyword', 'Declares a class — a blueprint defining the state and behavior shared by its objects.', KEYWORDS],
  ['interface', 'keyword', 'Declares an interface — a reference type containing abstract methods and constants that classes can implement.', KEYWORDS],
  ['extends', 'keyword', 'Indicates that a class is derived from a superclass or an interface extends another interface.', KEYWORDS],
  ['implements', 'keyword', 'Indicates that a class provides concrete implementations for the methods declared by one or more interfaces.', KEYWORDS],
  ['abstract', 'keyword', 'Declares a class that cannot be instantiated, or a method without a body that subclasses must implement.', KEYWORDS],
  ['final', 'keyword', 'Marks a class that cannot be subclassed, a method that cannot be overridden, or a variable that cannot be reassigned.', KEYWORDS],
  ['static', 'keyword', 'Declares a member that belongs to the class itself rather than to any instance.', KEYWORDS],
  ['void', 'keyword', 'Indicates that a method does not return any value.', KEYWORDS],
  ['new', 'keyword', 'Creates a new object by allocating memory and invoking a constructor.', KEYWORDS],
  ['return', 'keyword', 'Exits the current method, optionally returning a value to the caller.', KEYWORDS],
  ['this', 'keyword', 'A reference to the current object, the one whose method or constructor is being invoked.', KEYWORDS],
  ['super', 'keyword', 'Refers to the superclass, used to access its members or invoke its constructor.', KEYWORDS],
  ['if', 'keyword', 'Executes a block of code conditionally based on a boolean expression.', KEYWORDS],
  ['else', 'keyword', 'Specifies the block executed when the if condition is false.', KEYWORDS],
  ['for', 'keyword', 'A loop with initialization, condition, and update expressions, including the enhanced for-each form.', KEYWORDS],
  ['while', 'keyword', 'Repeatedly executes a block as long as its boolean condition remains true.', KEYWORDS],
  ['switch', 'keyword', 'Selects one of several code paths based on the value of an expression.', KEYWORDS],
  ['case', 'keyword', 'Labels a branch within a switch statement matched against the switch value.', KEYWORDS],
  ['break', 'keyword', 'Terminates the enclosing loop or switch statement.', KEYWORDS],
  ['continue', 'keyword', 'Skips to the next iteration of the enclosing loop.', KEYWORDS],
  ['try', 'keyword', 'Begins a block of statements whose exceptions are handled by associated catch or finally clauses.', KEYWORDS],
  ['catch', 'keyword', 'Handles exceptions of a specified type thrown within the associated try block.', KEYWORDS],
  ['finally', 'keyword', 'Defines a block that always executes after a try block, whether or not an exception occurred.', KEYWORDS],
  ['throw', 'keyword', 'Throws an exception object, transferring control to the nearest matching catch.', KEYWORDS],
  ['throws', 'keyword', 'Declares the checked exceptions that a method may propagate to its callers.', KEYWORDS],
  ['import', 'keyword', 'Makes types from other packages available by their simple names within the current file.', KEYWORDS],
  ['package', 'keyword', 'Declares the package, a namespace grouping, to which the current source file belongs.', KEYWORDS],
  ['enum', 'keyword', 'Declares an enumerated type whose values are a fixed set of named constants.', KEYWORDS],
  ['boolean', 'type', 'A primitive type with the two possible values true and false.', KEYWORDS],
  ['int', 'type', 'A 32-bit signed two’s-complement integer primitive type.', KEYWORDS],
  ['long', 'type', 'A 64-bit signed two’s-complement integer primitive type.', KEYWORDS],
  ['double', 'type', 'A 64-bit IEEE-754 double-precision floating-point primitive type.', KEYWORDS],
  ['null', 'constant', 'A literal representing a reference that does not point to any object.', KEYWORDS],
  ['String', 'type', 'An immutable sequence of characters. String objects underpin most text handling in Java.', `${LANG}/String.html`],
  ['Object', 'type', 'The root of the class hierarchy. Every class has Object as a superclass.', `${LANG}/Object.html`],
  ['Integer', 'type', 'A wrapper class boxing a primitive int value in an object, with parsing and conversion utilities.', `${LANG}/Integer.html`],
  ['System', 'type', 'A utility class providing standard input, output, and error streams and access to system properties.', `${LANG}/System.html`],
  ['List', 'type', 'An ordered collection (sequence) interface that allows duplicate elements and positional access.', 'en/java/javase/21/docs/api/java.base/java/util/List.html'],
]

export const javaTokens: TokenDictionary = buildDictionary('Java SE docs', (slug) => `${ORACLE}/${slug}`, javaRows)
