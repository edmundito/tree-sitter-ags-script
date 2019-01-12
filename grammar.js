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
  FIELD: 15,
  SUBSCRIPT: 16
}

const preprocIf = (suffix, content) => ({
  ['preproc_ifver' + suffix]: $ =>
    seq(
      choice(preprocessor('ifver'), preprocessor('ifnver')),
      $.version_literal,
      repeat(content($)),
      preprocessor('endif')
    ),

  ['preproc_ifdef' + suffix]: $ =>
    seq(
      choice(preprocessor('ifdef'), preprocessor('ifndef')),
      $.identifier,
      repeat(content($)),
      preprocessor('endif')
    )
})

const preprocessor = command => '#' + command

const commaSep = rule => optional(commaSep1(rule))

const commaSep1 = rule => seq(rule, repeat(seq(',', rule)))

const commaSepTrailing = (recurSymbol, rule) =>
  choice(rule, seq(recurSymbol, ',', rule))

const statement = (...args) => seq(...args, ';')

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
    [$.field_access_specifier, $.function_access_specifier]
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ =>
      choice(
        $.function_definition,
        $.import_declaration,
        $.export_declaration,
        $.enum_declaration,
        $.struct_declaration,
        $.declaration,
        $._empty_declaration,
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
        $._empty_declaration,
        $.preproc_ifver,
        $.preproc_ifdef,
        $.preproc_def,
        $.preproc_error,
        $.preproc_region
      ),

    // Preprocessors

    preproc_def: $ =>
      seq(preprocessor('define'), $.identifier, optional($.preproc_arg), '\n'),

    preproc_error: $ => seq(preprocessor('error'), $.preproc_arg, '\n'),

    preproc_region: $ =>
      seq(
        preprocessor('region'),
        optional($.preproc_arg),
        repeat($._top_level_item),
        preprocessor('endregion')
      ),

    ...preprocIf('', $ => $._top_level_item),
    ...preprocIf(
      '_in_field_declaration_list',
      $ => $._field_declaration_list_item
    ),

    preproc_arg: $ => token(prec(0, repeat1(/.|\\\r?\n/))),

    // Main Grammar

    function_definition: $ =>
      seq(
        $._function_definition_specifiers,
        $.function_declarator,
        $.compound_statement
      ),

    function_declaration: $ =>
      seq($._function_definition_specifiers, $.function_import_declarator),

    declaration: $ =>
      statement(
        $._declaration_specifiers,
        commaSep1(choice($._declarator, $.init_declarator))
      ),

    _top_level_declaration: $ =>
      statement(choice($.struct_declaration, $.enum_declaration)),

    export_declaration: $ => statement('export', commaSep1($.identifier)),

    import_declaration: $ =>
      statement('import', choice($.function_declaration, $._type_declaration)),

    _type_declaration: $ => seq($._type_specifier, $.identifier),

    _function_definition_specifiers: $ =>
      seq(repeat($.function_access_specifier), $._function_type_specifier),

    function_access_specifier: $ => choice('protected', 'static'),

    _function_type_specifier: $ =>
      choice($.function_type, $.primitive_type, $._type_identifier),

    function_type: $ => choice('function', 'void'),

    _declaration_specifiers: $ => $._type_specifier,

    _parameter_declaration_specifiers: $ =>
      seq(optional($.type_qualifier), $._type_specifier),

    type_qualifier: $ => 'const',

    _declarator: $ => choice($.pointer_declarator, $._pointerless_declarator),

    _pointerless_declarator: $ => choice($.array_declarator, $.identifier),

    _parameter_declarator: $ =>
      choice($.pointer_declarator, $.array_declarator, $.identifier),

    _parameter_import_declarator: $ =>
      choice($.pointer_declarator, $.array_declarator, $.enumerator),

    _field_declarator: $ =>
      choice(
        alias($.pointer_field_declarator, $.pointer_declarator),
        $._pointerless_field_declarator
      ),

    _pointerless_field_declarator: $ =>
      choice(
        // alias($.function_field_declarator, $.function_declarator),
        alias($.array_field_declarator, $.array_declarator),
        $._field_identifier
      ),

    //TODO: Pointers are only supported on managed types
    pointer_declarator: $ =>
      prec.dynamic(1, prec.right(seq('*', $._pointerless_declarator))),
    pointer_field_declarator: $ =>
      prec.dynamic(1, prec.right(seq('*', $._pointerless_field_declarator))),

    function_declarator: $ =>
      prec(1, seq($._function_declarator, $.parameter_list)),

    _function_declarator: $ =>
      choice(
        $._function_pointer_declarator,
        $._function_pointerless_declarator
      ),
    _function_pointer_declarator: $ =>
      prec.dynamic(1, prec.right(seq('*', $._function_pointerless_declarator))),
    _function_pointerless_declarator: $ =>
      choice($._function_array_declarator, $._function_identifier),
    _function_array_declarator: $ => prec(1, seq('[]', $._function_identifier)),
    _function_identifier: $ =>
      seq(optional($.function_qualifier), $._optional_scoped_identifier),

    function_qualifier: $ => 'noloopcheck',

    function_import_declarator: $ =>
      prec(1, seq($._function_import_declarator, $.parameter_import_list)),

    _function_import_declarator: $ =>
      choice(
        $._function_import_pointer_declarator,
        $._function_import_pointerless_declarator
      ),
    _function_import_pointer_declarator: $ =>
      prec.dynamic(
        1,
        prec.right(seq('*', $._function_import_pointerless_declarator))
      ),
    _function_import_pointerless_declarator: $ =>
      choice($._function_import_array_declarator, $.identifier),
    _function_import_array_declarator: $ => prec(1, seq('[]', $.identifier)),

    function_field_declarator: $ =>
      prec(1, seq($._field_declarator, $.parameter_list)),

    array_declarator: $ =>
      prec(
        1,
        seq($.identifier, '[', optional(choice($._expression, '*')), ']')
      ),
    array_field_declarator: $ =>
      prec(
        1,
        seq($._field_identifier, '[', optional(choice($._expression, '*')), ']')
      ),

    init_declarator: $ =>
      seq($._declarator, '=', choice($.initializer_list, $._expression)),

    compound_statement: $ => seq('{', repeat($._block_level_item), '}'),

    field_access_specifier: $ => choice('writeprotected', 'protected'),

    struct_type_qualifier: $ => 'managed',

    _type_specifier: $ => choice($.primitive_type, $._type_identifier),

    primitive_type: $ =>
      token(choice('bool', 'char', 'float', 'int', 'long', 'short', 'string')),

    enum_declaration: $ =>
      statement('enum', $._type_identifier, $.enumerator_list),

    enumerator_list: $ => seq('{', commaSep($.enumerator), optional(','), '}'),

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
        $.field_import_declaration,
        alias($.preproc_ifver_in_field_declaration_list, $.preproc_ifver),
        alias($.preproc_ifdef_in_field_declaration_list, $.preproc_ifdef)
      ),

    field_import_declaration: $ => statement('import', $.function_declaration),

    field_declaration: $ =>
      statement(
        optional($.field_access_specifier),
        $._declaration_specifiers,
        $._field_declarator
      ),

    enumerator: $ =>
      seq($.identifier, optional(seq('=', choice($.identifier, $._literal)))),

    parameter_list: $ => seq('(', commaSep($.parameter_declaration), ')'),

    parameter_declaration: $ =>
      seq(
        $._parameter_declaration_specifiers,
        optional($._parameter_declarator)
      ),

    parameter_import_list: $ =>
      seq('(', commaSep($.parameter_import_declaration), ')'),

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
          optional(seq('else', $._statement))
        )
      ),

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
        $.logical_expression,
        $.bitwise_expression,
        $.equality_expression,
        $.relational_expression,
        $.shift_expression,
        $.math_expression,
        $.pointer_expression,
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

    pointer_expression: $ =>
      choice(prec.left(PREC.UNARY, seq('*', $._expression))),

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

    initializer_list: $ =>
      seq(
        '{',
        commaSep(choice($.initializer_pair, $._expression, $.initializer_list)),
        optional(','),
        '}'
      ),

    initializer_pair: $ =>
      seq(
        repeat1(choice($.subscript_designator, $.field_designator)),
        '=',
        choice($._expression, $.initializer_list)
      ),

    subscript_designator: $ => seq('[', $._expression, ']'),

    field_designator: $ => seq('.', $._field_identifier),

    number_literal: $ => /\d+(\.\d+)?/,

    char_literal: $ =>
      seq("'", choice($.escape_sequence, token.immediate(/[^\n']/)), "'"),

    concatenated_string: $ => seq($.string_literal, repeat1($.string_literal)),

    string_literal: $ =>
      seq(
        '"',
        repeat(
          choice(token.immediate(prec(1, /[^\\"\n]+/)), $.escape_sequence)
        ),
        '"'
      ),

    //FIXME: Replace with AGS String formatting
    escape_sequence: $ =>
      token.immediate(
        seq(
          '%',
          choice(
            /[^xuU]/,
            /\d{2,3}/,
            /x[0-9a-fA-F]{2,}/,
            /u[0-9a-fA-F]{4}/,
            /U[0-9a-fA-F]{8}/
          )
        )
      ),

    true: $ => 'true',
    false: $ => 'false',
    null: $ => 'null',

    _literal: $ =>
      choice(
        $.number_literal,
        $.string_literal,
        $.true,
        $.false,
        $.null,
        $.char_literal
      ),

    version_literal: $ => /\d+(\.\d+)?(\.\d+)?/,

    identifier: $ => /[a-zA-Z_]\w*/,
    scoped_identifier: $ =>
      prec(1, seq($._type_identifier, '::', $.identifier)),
    _optional_scoped_identifier: $ => choice($.identifier, $.scoped_identifier),

    _type_identifier: $ => alias($.identifier, $.type_identifier),
    _field_identifier: $ => alias($.identifier, $.field_identifier),
    _statement_identifier: $ => alias($.identifier, $.statement_identifier),

    _empty_declaration: $ => statement($._declaration_specifiers),

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: $ =>
      token(choice(seq('//', /.*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')))
  }
})

module.exports.PREC = PREC
