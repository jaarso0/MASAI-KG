export const HTML_QUERIES = `
(attribute
  (attribute_name) @attr_name
  (quoted_attribute_value
    (attribute_value) @name)
  (#eq? @attr_name "id")) @definition.variable

(attribute
  (attribute_name) @attr_name
  (attribute_value) @name
  (#eq? @attr_name "id")) @definition.variable

(script_element
  (start_tag
    (attribute
      (attribute_name) @attr_name
      (quoted_attribute_value
        (attribute_value) @name))
    (#eq? @attr_name "src"))) @import

(script_element
  (start_tag
    (attribute
      (attribute_name) @attr_name
      (attribute_value) @name)
    (#eq? @attr_name "src"))) @import

(element
  (start_tag
    (tag_name) @tag_name
    (attribute
      (attribute_name) @attr_name
      (quoted_attribute_value
        (attribute_value) @name)))
  (#eq? @tag_name "link")
  (#eq? @attr_name "href")) @import

(element
  (start_tag
    (tag_name) @tag_name
    (attribute
      (attribute_name) @attr_name
      (attribute_value) @name))
  (#eq? @tag_name "link")
  (#eq? @attr_name "href")) @import

(ERROR) @error
`;
