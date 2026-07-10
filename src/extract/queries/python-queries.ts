export const PYTHON_QUERIES = `
(class_definition
  name: (identifier) @name) @definition.class

(function_definition
  name: (identifier) @name) @definition.function

(class_definition
  superclasses: (argument_list
    [
      (identifier)
      (attribute)
    ] @name)) @inherit

(assignment
  left: (identifier) @name) @definition.variable

(call
  function: [
    (identifier)
    (attribute)
  ] @name) @call

(import_statement
  [
    (dotted_name) @name
    (aliased_import
      alias: (identifier) @name)
  ]) @import

(import_from_statement
  name: [
    (dotted_name) @name
    (aliased_import
      alias: (identifier) @name)
  ]) @import

(ERROR) @error
`;
