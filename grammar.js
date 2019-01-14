const PREC = {
  ASSIGNMENT: -1,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  INCLUSIVE_OR: 3,
  EXCLUSIVE_OR: 4,
  BITWISE_AND: 5,
  EQUAL: 6,
  RELATIONAL: 7,
  SHIFT: 9,
  ADD: 10,
  MULTIPLY: 11,
  CAST: 12,
  UNARY: 13,
  CALL: 14,
  NEW: 15,
  FIELD: 15,
  SUBSCRIPT: 16
}

const preprocessorRules = (suffix, content, repeatContent = true) => ({
  ['preproc_ifver' + suffix]: $ =>
    seq(
      choice(preprocessor('ifver'), preprocessor('ifnver')),
      $.version_literal,
      repeatContent ? repeat(content($)) : content($),
      preprocessor('endif')
    ),

  ['preproc_ifdef' + suffix]: $ =>
    seq(
      choice(preprocessor('ifdef'), preprocessor('ifndef')),
      $.identifier,
      repeatContent ? repeat(content($)) : content($),
      preprocessor('endif')
    ),

  ['preproc_region' + suffix]: $ =>
    seq(
      preprocessor('region'),
      optional($.preproc_arg),
      repeatContent ? repeat(content($)) : content($),
      preprocessor('endregion')
    )
})

/**
 * Generates a function declarator.
 * A function declarator can be used to declare a function past the type.
 * It can be used for function definition and import function declaration
 *
 * Example:
 * To generate a declarator with pointer and array return:
 * *[] GetPointerArrays(int arg1, int arg2)
 *
 * functionDeclarator('example', $ => $.identifier, $ => $.parameter_list)
 * Output Tree: (function_example_declarator "*" "[]" (identifier) (parameter_list))
 *
 * @param {string} id Used to identify the declarator
 * @param {function} getIdentifier function that returns the identifier of the declarator
 * @param {function} getParameterList function the returns the paramter_list
 *
 * @return {object} grammar rules for function declarator
 */
const functionDeclaratorRules = (id, getIdentifier, getParameterList) => {
  const key = suffix => {
    return 'function_' + (id ? id + '_' : '') + suffix
  }

  const _key = suffix => '_' + key(suffix)

  const rules = {
    [key('declarator')]: $ =>
      prec(1, seq($[_key('declarator')], getParameterList($))),

    [_key('declarator')]: $ =>
      choice($[_key('pointer_declarator')], $[_key('pointerless_declarator')]),

    [_key('pointer_declarator')]: $ =>
      prec.dynamic(1, prec.right(seq('*', $[_key('pointerless_declarator')]))),

    [_key('pointerless_declarator')]: $ =>
      choice($[_key('array_declarator')], getIdentifier($)),

    [_key('array_declarator')]: $ => prec(1, seq('[]', getIdentifier($)))
  }

  return rules
}

const preprocessor = command => '#' + command

const commaSep = rule => optional(commaSep1(rule))

const commaSep1 = rule => seq(rule, repeat(seq(',', rule)))

const commapSepLeading = (firstRule, repeatRule) =>
  choice(seq(firstRule, repeat(seq(',', repeatRule))), commaSep(repeatRule))

const commaSepTrailing = (recurSymbol, rule) =>
  choice(rule, seq(recurSymbol, ',', rule))

const statement = (...args) => seq(...args, ';')

const parenthesis = (...args) => seq('(', ...args, ')')

module.exports = grammar({
  name: 'ags_script',

  extras: $ => [/\s/, $.comment],

  inline: $ => [
    $._statement,
    $._top_level_item,
    $._type_identifier,
    $._field_identifier,
    $._statement_identifier
  ],

  conflicts: $ => [
    [$._type_specifier, $._declarator],
    [$._type_specifier, $._expression],
    [$._function_type_specifier, $._type_specifier],
    [$._function_type_specifier, $._type_specifier, $._expression],
    [$.field_access_specifier, $.field_function_access_specifier]
  ],

  word: $ => $.identifier,

  rules: {
    script: $ => repeat($._top_level_item),

    _top_level_item: $ =>
      choice(
        $.function_definition,
        $.import_declaration,
        $.export_declaration,
        $.enum_declaration,
        $.struct_declaration,
        $.top_level_declaration,
        $.preproc_ifver,
        $.preproc_ifdef,
        $.preproc_def,
        $.preproc_error,
        $.preproc_region
      ),

    _block_level_item: $ =>
      choice(
        $.declaration,
        $._statement,
        $.preproc_error,
        $.preproc_def,
        alias($.preproc_ifver_in_block, $.preproc_ifver),
        alias($.preproc_ifdef_in_block, $.preproc_ifdef),
        alias($.preproc_region_in_block, $.preproc_region)
      ),

    // Preprocessors

    preproc_def: $ =>
      seq(
        preprocessor('define'),
        $._preproc_identifier,
        optional($._expression),
        '\n'
      ),

    preproc_error: $ => seq(preprocessor('error'), $.preproc_arg, '\n'),

    ...preprocessorRules('', $ => $._top_level_item),
    ...preprocessorRules('_in_block', $ => $._block_level_item),
    ...preprocessorRules(
      '_in_field_declaration_list',
      $ => $._field_declaration_list_item
    ),
    ...preprocessorRules('_in_enumerator_list', $ => $._enumerator_list_item),
    ...preprocessorRules('_with_else', $ => $._else_item, false),

    preproc_arg: $ => token(prec(0, repeat1(/.|\\\r?\n/))),

    // Main Grammar

    function_definition: $ =>
      seq(
        $._function_definition_specifiers,
        $.function_declarator,
        $.compound_statement
      ),

    _function_declaration: $ =>
      seq($._function_definition_specifiers, $.function_import_declarator),

    field_function_declaration: $ =>
      statement(
        $._field_function_declaration_specifiers,
        $.function_field_declarator
      ),

    top_level_declaration: $ =>
      statement(
        $._declaration_specifiers,
        commaSep1(choice($._declarator, $.init_literal_declarator))
      ),

    declaration: $ =>
      statement(
        $._declaration_specifiers,
        commaSep1(choice($._declarator, $.init_declarator))
      ),

    _top_level_declaration: $ =>
      statement(choice($.struct_declaration, $.enum_declaration)),

    export_declaration: $ => statement('export', commaSep1($.identifier)),

    import_declaration: $ =>
      statement('import', choice($._function_declaration, $._type_declaration)),

    _type_declaration: $ => seq($._type_specifier, $.identifier),

    _function_definition_specifiers: $ =>
      seq(repeat($.function_access_specifier), $._function_type_specifier),

    _field_function_declaration_specifiers: $ =>
      seq(
        repeat(
          alias($.field_function_access_specifier, $.function_access_specifier)
        ),
        $._function_type_specifier
      ),

    field_function_access_specifier: $ =>
      choice('import', 'protected', 'static'),

    function_access_specifier: $ => choice('protected', 'static'),

    _function_type_specifier: $ =>
      choice($.function_type, $.primitive_type, $._type_identifier),

    function_type: $ => choice('function', 'void'),

    _declaration_specifiers: $ =>
      seq(optional($.type_qualifier), $._type_specifier),

    _parameter_declaration_specifiers: $ =>
      seq(optional($.parameter_type_qualifier), $._type_specifier),

    parameter_type_qualifier: $ => 'const',

    type_qualifier: $ => 'readonly',

    _declarator: $ => choice($.pointer_declarator, $._pointerless_declarator),

    _pointerless_declarator: $ => choice($.array_declarator, $.identifier),

    _parameter_declarator: $ =>
      choice($.pointer_declarator, $.array_declarator, $.identifier),

    _parameter_import_declarator: $ =>
      choice(
        $.pointer_declarator,
        $.array_declarator,
        choice($.identifier, $.init_literal_declarator)
      ),

    _field_declarator: $ =>
      choice(
        alias($.pointer_field_declarator, $.pointer_declarator),
        $._pointerless_field_declarator
      ),

    _pointerless_field_declarator: $ =>
      choice(
        alias($.array_field_declarator, $.array_declarator),
        $._field_identifier
      ),

    //TODO: Pointers are only supported on managed types
    pointer_declarator: $ =>
      prec.dynamic(1, prec.right(seq('*', $._pointerless_declarator))),
    pointer_field_declarator: $ =>
      prec.dynamic(1, prec.right(seq('*', $._pointerless_field_declarator))),

    _function_identifier: $ =>
      seq(optional($.function_qualifier), $._optional_scoped_identifier),

    function_qualifier: $ => 'noloopcheck',

    ...functionDeclaratorRules(
      '',
      $ => $._function_identifier,
      $ => $.parameter_list
    ),

    ...functionDeclaratorRules(
      'import',
      $ => $.identifier,
      $ => $.parameter_import_list
    ),

    ...functionDeclaratorRules(
      'field',
      $ => $._field_identifier,
      $ => $.parameter_field_list
    ),

    array_declarator: $ =>
      prec(1, seq($.identifier, '[', optional($._expression), ']')),

    array_field_declarator: $ =>
      prec(
        1,
        seq(
          $._field_identifier,
          '[',
          optional(choice($._preproc_identifier, $.integer_literal)),
          ']'
        )
      ),

    init_declarator: $ => seq($._declarator, '=', $._expression),

    init_literal_declarator: $ =>
      seq($._pointerless_declarator, '=', choice($.identifier, $._literal)),

    compound_statement: $ => seq('{', repeat($._block_level_item), '}'),

    field_access_specifier: $ =>
      choice('import', 'attribute', 'writeprotected', 'protected'),

    struct_type_qualifier: $ => 'managed',

    _type_specifier: $ => choice($.primitive_type, $._type_identifier),

    primitive_type: $ =>
      token(choice('bool', 'char', 'float', 'int', 'long', 'short', 'string')),

    enum_declaration: $ =>
      statement('enum', $._type_identifier, $.enumerator_list),

    enumerator_list: $ => seq('{', commaSep($.enumerator), optional(','), '}'),

    _enumerator_list_item: $ =>
      choice(
        $.enumerator,
        alias($.preproc_ifver_in_enumerator_list, $.preproc_ifver),
        alias($.preproc_ifdef_in_enumerator_list, $.preproc_ifdef),
        alias($.preproc_region_in_enumerator_list, $.preproc_region)
      ),

    struct_declaration: $ =>
      statement(
        optional($.struct_type_qualifier),
        'struct',
        $._type_identifier,
        optional($.extends_type),
        $.field_declaration_list
      ),

    extends_type: $ => seq('extends', $._type_identifier),

    field_declaration_list: $ =>
      seq('{', repeat($._field_declaration_list_item), '}'),

    _field_declaration_list_item: $ =>
      choice(
        $.field_declaration,
        $.field_function_declaration,
        alias($.preproc_ifver_in_field_declaration_list, $.preproc_ifver),
        alias($.preproc_ifdef_in_field_declaration_list, $.preproc_ifdef),
        alias($.preproc_region_in_field_declaration_list, $.preproc_region)
      ),

    field_declaration: $ =>
      statement(
        repeat($.field_access_specifier),
        $._type_specifier,
        $._field_declarator
      ),

    enumerator: $ =>
      seq($.identifier, optional(seq('=', choice($.identifier, $._literal)))),

    extender_parameter: $ => seq('this', $._type_identifier, '*'),

    parameter_list: $ =>
      parenthesis(
        commapSepLeading($.extender_parameter, $.parameter_declaration)
      ),

    parameter_declaration: $ =>
      seq(
        $._parameter_declaration_specifiers,
        optional($._parameter_declarator)
      ),

    parameter_field_list: $ =>
      parenthesis(commaSep($.parameter_import_declaration)),

    parameter_import_list: $ =>
      parenthesis(
        commapSepLeading($.extender_parameter, $.parameter_import_declaration)
      ),

    parameter_import_declaration: $ =>
      seq(
        $._parameter_declaration_specifiers,
        optional($._parameter_import_declarator)
      ),

    // Statements

    _statement: $ =>
      choice(
        $.compound_statement,
        $.expression_statement,
        $.if_statement,
        $.switch_statement,
        $.do_statement,
        $.while_statement,
        $.for_statement,
        $.return_statement,
        $.break_statement,
        $.continue_statement
      ),

    expression_statement: $ =>
      statement(optional(choice($._expression, $.comma_expression))),

    if_statement: $ =>
      prec.right(
        seq(
          'if',
          $.parenthesized_expression,
          $._statement,
          repeat($._else_preproc_item),
          optional($._else_statement)
        )
      ),

    _else_preproc_item: $ =>
      choice(
        alias($.preproc_ifdef_with_else, $.preproc_ifdef),
        alias($.preproc_ifver_with_else, $.preproc_ifver),
        alias($.preproc_region_with_else, $.preproc_region)
      ),

    _else_item: $ => choice(repeat1($._else_preproc_item), $._else_statement),

    _else_statement: $ => seq('else', $._statement),

    switch_statement: $ =>
      seq(
        'switch',
        $.parenthesized_expression,
        alias($.switch_body, $.compound_statement)
      ),

    switch_body: $ =>
      seq('{', repeat(choice($.case_statement, $._statement)), '}'),

    case_statement: $ =>
      prec.right(
        seq(
          choice(seq('case', $._expression), 'default'),
          ':',
          repeat(choice($._statement, $.declaration))
        )
      ),

    while_statement: $ =>
      seq('while', $.parenthesized_expression, $._statement),

    do_statement: $ =>
      seq('do', $._statement, 'while', $.parenthesized_expression),

    for_statement: $ =>
      seq(
        'for',
        '(',
        choice($.declaration, statement(optional($._expression))),
        optional($._expression),
        ';',
        commaSep($._expression),
        ')',
        $._statement
      ),

    return_statement: $ => statement('return', optional($._expression)),

    break_statement: $ => statement('break'),

    continue_statement: $ => statement('continue'),

    // Expressions

    _expression: $ =>
      choice(
        $.assignment_expression,
        $.new_expression,
        $.logical_expression,
        $.bitwise_expression,
        $.equality_expression,
        $.relational_expression,
        $.shift_expression,
        $.math_expression,
        $.subscript_expression,
        $.call_expression,
        $.field_expression,
        $.identifier,
        $.number_literal,
        $.string_literal,
        $.true,
        $.false,
        $.null,
        $.concatenated_string,
        $.char_literal,
        $.parenthesized_expression
      ),

    comma_expression: $ =>
      seq($._expression, ',', choice($._expression, $.comma_expression)),

    assignment_expression: $ =>
      prec.right(
        PREC.ASSIGNMENT,
        seq(
          $._expression,
          choice('=', '*=', '/=', '+=', '-=', '<<=', '>>=', '&=', '^=', '|='),
          $._expression
        )
      ),

    new_expression: $ =>
      prec.right(
        PREC.NEW,
        seq('new', $._type_specifier, optional($.new_array_declator))
      ),

    new_array_declator: $ => seq('[', $._expression, ']'),

    logical_expression: $ =>
      choice(
        prec.left(PREC.LOGICAL_OR, seq($._expression, '||', $._expression)),
        prec.left(PREC.LOGICAL_AND, seq($._expression, '&&', $._expression)),
        prec.left(PREC.UNARY, seq('!', $._expression))
      ),

    bitwise_expression: $ =>
      choice(
        prec.left(PREC.INCLUSIVE_OR, seq($._expression, '|', $._expression)),
        prec.left(PREC.EXCLUSIVE_OR, seq($._expression, '^', $._expression)),
        prec.left(PREC.BITWISE_AND, seq($._expression, '&', $._expression))
      ),

    equality_expression: $ =>
      prec.left(
        PREC.EQUAL,
        seq($._expression, choice('==', '!='), $._expression)
      ),

    relational_expression: $ =>
      prec.left(
        PREC.RELATIONAL,
        seq($._expression, choice('<', '>', '<=', '>='), $._expression)
      ),

    shift_expression: $ =>
      prec.left(
        PREC.SHIFT,
        seq($._expression, choice('<<', '>>'), $._expression)
      ),

    math_expression: $ =>
      choice(
        prec.left(PREC.ADD, seq($._expression, '+', $._expression)),
        prec.left(PREC.ADD, seq($._expression, '-', $._expression)),
        prec.left(PREC.MULTIPLY, seq($._expression, '*', $._expression)),
        prec.left(PREC.MULTIPLY, seq($._expression, '/', $._expression)),
        prec.left(PREC.MULTIPLY, seq($._expression, '%', $._expression)),
        prec.right(PREC.UNARY, seq('-', $._expression)),
        prec.right(PREC.UNARY, seq('+', $._expression)),
        prec.right(PREC.UNARY, seq(choice('--', '++'), $._expression)),
        prec.right(PREC.UNARY, seq($._expression, choice('++', '--')))
      ),

    subscript_expression: $ =>
      prec(PREC.SUBSCRIPT, seq($._expression, '[', $._expression, ']')),

    call_expression: $ => prec(PREC.CALL, seq($._expression, $.argument_list)),

    argument_list: $ => seq('(', commaSep($._expression), ')'),

    field_expression: $ =>
      seq(prec(PREC.FIELD, seq($._expression, '.')), $._field_identifier),

    parenthesized_expression: $ =>
      seq('(', choice($._expression, $.comma_expression), ')'),

    integer_literal: $ => /\d+/,

    number_literal: $ => /\d+(\.\d+)?/,

    char_literal: $ =>
      seq("'", choice($.escape_sequence, token.immediate(/[^\n']/)), "'"),

    concatenated_string: $ => seq($.string_literal, repeat1($.string_literal)),

    string_literal: $ =>
      seq(
        '"',
        repeat(
          choice(token.immediate(prec(1, /[^%\[\\"\n]+/)), $.escape_sequence)
        ),
        '"'
      ),

    //FIXME: Replace with AGS String formatting
    escape_sequence: $ =>
      token.immediate(
        choice(
          seq('\\', choice('[', '\\', 'n', 'r', "'", '"', '%')),
          '[',
          seq('%', choice(/(0[0-9]+)?d/, 'c', 's', '%', /(.[0-9]+)?f/))
        )
      ),

    true: $ => 'true',
    false: $ => 'false',
    null: $ => 'null',

    _literal: $ =>
      choice($.number_literal, $.true, $.false, $.null, $.char_literal),

    version_literal: $ => /\d+(\.\d+){0,3}/,

    identifier: $ => /[a-zA-Z_]\w*/,
    scoped_identifier: $ =>
      prec(1, seq($._type_identifier, '::', $.identifier)),
    _optional_scoped_identifier: $ => choice($.identifier, $.scoped_identifier),

    _preproc_identifier: $ => alias($.identifier, $.preproc_identifier),
    _type_identifier: $ => alias($.identifier, $.type_identifier),
    _field_identifier: $ => alias($.identifier, $.field_identifier),
    _statement_identifier: $ => alias($.identifier, $.statement_identifier),

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: $ =>
      token(choice(seq('//', /.*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')))
  }
})

module.exports.PREC = PREC
