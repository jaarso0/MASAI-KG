export const JAVA_QUERIES = `
(class_declaration
  name: (identifier) @name) @definition.class

(interface_declaration
  name: (identifier) @name) @definition.interface

(method_declaration
  name: (identifier) @name) @definition.method

(constructor_declaration
  name: (identifier) @name) @definition.method

(variable_declarator
  name: (identifier) @name) @definition.variable

(method_invocation
  name: (identifier) @name) @call

(object_creation_expression
  type: [
    (type_identifier)
    (scoped_type_identifier)
  ] @name) @new

(import_declaration
  [
    (scoped_identifier)
    (identifier)
  ] @name) @import

(class_declaration
  superclass: (superclass
    [
      (type_identifier)
      (scoped_type_identifier)
    ] @name)) @inherit

(interface_declaration
  (extends_interfaces
    (type_list
      [
        (type_identifier)
        (scoped_type_identifier)
      ] @name))) @inherit

(class_declaration
  interfaces: (super_interfaces
    (type_list
      [
        (type_identifier)
        (scoped_type_identifier)
      ] @name))) @implement

(ERROR) @error
`;
