// ---------------------------------------------------------------------------
// RhostMUSH built-in function signature database
// ---------------------------------------------------------------------------

export type Platform = 'rhost' | 'penn' | 'mux';

export interface FunctionSignature {
  name: string;
  minArgs: number;
  /** Use Infinity for variadic functions with no upper bound */
  maxArgs: number;
  deprecated?: boolean;
  /** True for functions specific to RhostMUSH (not standard PennMUSH/TinyMUX) */
  rhostOnly?: boolean;
  /**
   * If set, the function is only available on these platforms.
   * Omit for functions that are universally available.
   */
  platforms?: Platform[];
}

// minArgs, maxArgs shorthand builder
function sig(minArgs: number, maxArgs: number, opts: Partial<FunctionSignature> = {}): FunctionSignature {
  return { name: '', minArgs, maxArgs, ...opts };
}

const INF = Infinity;

const DEFINITIONS: [string, number, number, Partial<FunctionSignature>?][] = [
  // -------------------------------------------------------------------------
  // Math
  // -------------------------------------------------------------------------
  ['abs',        1, 1],
  ['add',        2, INF],
  ['sub',        2, 2],
  ['mul',        2, INF],
  ['div',        2, 2],
  ['fdiv',       2, 2],
  ['mod',        2, 2],
  ['modulo',     2, 2],
  ['remainder',  2, 2],
  ['power',      2, 2],
  ['sqrt',       1, 1],
  ['ceil',       1, 1],
  ['floor',      1, 1],
  ['round',      1, 2],
  ['trunc',      1, 1],
  ['max',        1, INF],
  ['min',        1, INF],
  ['sign',       1, 1],
  ['gt',         2, 2],
  ['gte',        2, 2],
  ['lt',         2, 2],
  ['lte',        2, 2],
  ['eq',         2, 2],
  ['neq',        2, 2],
  ['and',        2, INF],
  ['or',         2, INF],
  ['not',        1, 1],
  ['xor',        2, 2],
  ['nand',       2, INF],
  ['nor',        2, INF],
  ['band',       2, 2],
  ['bor',        2, 2],
  ['bxor',       2, 2],
  ['bnot',       1, 1],
  ['bshl',       2, 2],
  ['bshr',       2, 2],
  ['pi',         0, 0],
  ['e',          0, 0],
  ['sin',        1, 2],
  ['cos',        1, 2],
  ['tan',        1, 2],
  ['asin',       1, 2],
  ['acos',       1, 2],
  ['atan',       1, 3],
  ['exp',        1, 1],
  ['ln',         1, 1],
  ['log',        1, 2],
  ['dist2d',     4, 4],
  ['dist3d',     6, 6],
  ['isnum',      1, 1],
  ['isint',      1, 1],

  // -------------------------------------------------------------------------
  // String
  // -------------------------------------------------------------------------
  ['strlen',     1, 1],
  ['len',        1, 1],
  ['lcstr',      1, 1],
  ['ucstr',      1, 1],
  ['capstr',     1, 1],
  ['left',       2, 2],
  ['right',      2, 2],
  ['mid',        3, 3],
  ['first',      1, 2],
  ['last',       1, 2],
  ['rest',       1, 2],
  ['before',     2, 2],
  ['after',      2, 2],
  ['cat',        1, INF],
  ['strcat',     1, INF],
  ['trim',       1, 3],
  ['ltrim',      1, 2],
  ['rtrim',      1, 2],
  ['space',      1, 1],
  ['ljust',      2, 3],
  ['rjust',      2, 3],
  ['center',     2, 3],
  ['repeat',     2, 2],
  ['edit',       3, INF],
  ['replace',    3, 4],
  ['revwords',   1, 2],
  ['words',      1, 2],
  ['word',       2, 3],
  ['wordpos',    2, 3],
  ['numwords',   1, 2],
  ['index',      3, 4],
  ['rindex',     3, 3],
  ['pos',        2, 2],
  ['lpos',       2, 3],
  ['comp',       2, 2],
  ['strcmp',     2, 2],
  ['strmatch',   2, 3],
  ['wildmatch',  2, 3],
  ['pmatch',     1, INF],
  ['escape',     1, 1],
  ['decompose',  1, 1],
  ['secure',     1, 1],
  ['stripansi',  1, 1],
  ['ansi',       2, 2],
  ['soundex',    1, 1,   { platforms: ['rhost', 'penn'] }],
  ['soundslike', 2, 2],
  ['strdistance',2, 2,   { rhostOnly: true, platforms: ['rhost'] }],
  ['checkstr',   1, 1],
  ['strinsert',  3, 3],
  ['encrypt',    2, 2],
  ['decrypt',    2, 2],
  ['encode64',   1, 1,   { rhostOnly: true, platforms: ['rhost'] }],
  ['decode64',   1, 1,   { rhostOnly: true, platforms: ['rhost'] }],
  ['digest',     2, 2,   { rhostOnly: true, platforms: ['rhost'] }],
  ['crypt',      2, 2],
  ['tr',         3, 3],
  ['flip',       0, 1],
  ['lit',        1, 1],
  ['readable',   1, 1],
  ['visible',    2, 2],
  ['valid',      2, 2],
  ['hastype',    2, 2],

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------
  ['member',     2, 3],
  ['elements',   2, 3],
  ['insert',     3, 4],
  ['remove',     2, 3],
  ['sort',       1, 4],
  ['lsort',      1, 4],
  ['sortby',     2, 4],
  ['shuffle',    1, 3],
  ['setunion',   2, 4],
  ['setinter',   2, 4],
  ['setdiff',    2, 4],
  ['setq',       2, INF],
  ['getq',       1, 1],
  ['r',          1, 1],
  ['filter',     2, 4],
  ['filterfun',  2, INF],
  ['map',        2, 5],
  ['fold',       2, 4],
  ['iter',       2, 4],
  ['parse',      2, 4],
  ['itext',      1, 1],
  ['inum',       1, 1],
  ['lnum',       1, 4],
  ['list',       2, INF],
  ['grab',       2, 3],
  ['graball',    2, 4],
  ['match',      2, 3],
  ['matchall',   2, 4],
  ['splice',     2, 3],
  ['unique',     1, 3],
  ['munge',      3, 5],
  ['step',       3, 5],
  ['table',      1, 6],

  // -------------------------------------------------------------------------
  // Object / database
  // -------------------------------------------------------------------------
  ['name',       1, 1],
  ['fullname',   1, 1],
  ['alias',      1, 1],
  ['owner',      1, 1],
  ['loc',        1, 1],
  ['rloc',       2, 2],
  ['con',        1, 1],
  ['next',       1, 1],
  ['num',        1, 1],
  ['dbref',      1, 1],
  ['locate',     3, 3],
  ['nearby',     2, 2],
  ['flags',      1, 2],
  ['hasflag',    2, 2],
  ['haspower',   2, 2],
  ['powers',     1, 1],
  ['type',       1, 1],
  ['istype',     2, 2],
  ['isobject',   1, 1],
  ['isroom',     1, 1],
  ['isplayer',   1, 1],
  ['isthing',    1, 1],
  ['isexit',     1, 1],
  ['isdbref',    1, 1],
  ['get',        1, 1],
  ['xget',       2, 2],
  ['get_eval',   1, 1],
  ['v',          1, 1],
  ['attr',       2, 2],
  ['lattr',      1, 2],
  ['lattrp',     1, 2],
  ['lcon',       1, 2],
  ['lexits',     1, 1],
  ['create',     1, 2],
  ['open',       1, 2],
  ['link',       2, 2],
  ['zone',       1, 1],
  ['parent',     1, 1],
  ['children',   1, 1],
  ['lparent',    1, 2],

  // -------------------------------------------------------------------------
  // Control / evaluation
  // -------------------------------------------------------------------------
  ['u',          1, INF],
  ['ulocal',     1, INF],
  ['ufun',       2, INF],
  ['udefault',   2, INF],
  ['ulambda',    2, INF],
  ['default',    2, 2],
  ['edefault',   2, 2],
  ['switch',     3, INF],
  ['switchall',  3, INF],
  ['cond',       2, INF],
  ['condall',    2, INF],
  ['if',         2, 3],
  ['ifelse',     3, 3],
  ['when',       2, 2],
  ['null',       0, INF],
  ['nop',        0, INF],
  ['localize',   1, 1,   { platforms: ['rhost', 'penn'] }],
  ['objeval',    2, 2],
  ['eval',       2, 2],
  ['apply',      2, 3],
  ['zfun',       1, INF],

  // -------------------------------------------------------------------------
  // Time / random
  // -------------------------------------------------------------------------
  ['time',       0, 1],
  ['secs',       0, 1],
  ['convsecs',   1, 1],
  ['convtime',   1, 1],
  ['timestring', 1, 2],
  ['rand',       1, 2],
  ['die',        2, 2],

  // -------------------------------------------------------------------------
  // Registers / misc
  // -------------------------------------------------------------------------
  ['setvars',    2, 2],
  ['xvars',      2, 2],
  ['lvars',      0, 1],
  ['execscript', 1, INF, { rhostOnly: true, platforms: ['rhost'] }],
  ['pemit',      2, 2],
  ['emit',       1, 1],
  ['remit',      2, 2],
  ['lemit',      1, 1],
  ['zemit',      2, 2],
  ['think',      1, 1],
  ['select',     3, INF],
];

/** Pre-built map of lowercase function name → signature for O(1) lookup */
export const BUILTIN_FUNCTIONS: ReadonlyMap<string, FunctionSignature> = new Map(
  DEFINITIONS.map(([name, min, max, opts]) => [
    name as string,
    { name: name as string, minArgs: min as number, maxArgs: max as number, ...(opts ?? {}) },
  ])
);
