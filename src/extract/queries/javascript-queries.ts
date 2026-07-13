export const JAVASCRIPT_QUERIES = `
(class_declaration
  name: (identifier) @name) @definition.class

(method_definition
  name: [
    (property_identifier)
    (identifier)
  ] @name) @definition.method

(function_declaration
  name: (identifier) @name) @definition.function

(variable_declarator
  name: (identifier) @name) @definition.variable

(field_definition
  property: (property_identifier) @name) @definition.variable

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

(class_heritage
  [
    (identifier)
    (member_expression)
  ] @name) @inherit

(jsx_opening_element
  name: (_) @name) @renders

(jsx_self_closing_element
  name: (_) @name) @renders

(ERROR) @error
`;
