export const TYPESCRIPT_QUERIES = `
(class_declaration
  name: (type_identifier) @name) @definition.class

(method_definition
  name: [
    (property_identifier)
    (identifier)
  ] @name) @definition.method

(function_declaration
  name: (identifier) @name) @definition.function

(interface_declaration
  name: (type_identifier) @name) @definition.interface

(type_alias_declaration
  name: (type_identifier) @name) @definition.type_alias

(variable_declarator
  name: (identifier) @name) @definition.variable

(call_expression
  function: [
    (identifier)
    (member_expression)
  ] @name) @call

(new_expression
  constructor: [
    (identifier)
    (member_expression)
  ] @name) @new

(import_specifier
  name: (identifier) @name
  !alias) @import

(import_specifier
  alias: (identifier) @name) @import

(namespace_import
  (identifier) @name) @import

(import_clause
  (identifier) @name) @import

(extends_clause
  [
    (identifier)
    (member_expression)
  ] @name) @inherit

(implements_clause
  [
    (type_identifier)
    (nested_type_identifier)
  ] @name) @implement

(type_annotation
  [
    (type_identifier)
    (nested_type_identifier)
    (generic_type)
  ] @name) @type_use

(ERROR) @error
`;
