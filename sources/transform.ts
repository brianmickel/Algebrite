import {
  breakpoint,
  caddr,
  cadr,
  car,
  cdddr,
  cddr,
  cdr,
  Constants,
  iscons,
  isNumericAtom,
  METAA,
  METAB,
  METAX,
  NIL,
  SYMBOL_A_UNDERSCORE,
  SYMBOL_B_UNDERSCORE,
  SYMBOL_X_UNDERSCORE,
  U,
  noexpand,
} from '../runtime/defs';
import { get_binding, set_binding, symbol } from '../runtime/symbol';
import { subtract } from './add';
import { polyform } from './bake';
import { decomp } from './decomp';
import { Eval } from './eval';
import { isZeroAtomOrTensor } from './is';
import { makeList } from './list';
import { scan_meta } from './scan';
import { subst } from './subst';

/*
Transform an expression using a pattern. The
pattern can come from the integrals table or
the user-defined patterns.

The expression and free variable are on the stack.

The argument s is a null terminated list of transform rules.

For example, see the itab (integrals table)

Internally, the following symbols are used:

  F  input expression

  X  free variable, i.e. F of X

  A  template expression

  B  result expression

  C  list of conditional expressions

Puts the final expression on top of stack
(whether it's transformed or not) and returns
true is successful, false if not.

*/

// p1 and p2 are tmps

//define F p3
//define X p4
//define A p5
//define B p6
//define C p7

export function transform(
  F: U,
  X: U,
  s: string[] | U,
  generalTransform: boolean
): [U, boolean] {
  const state = saveMetaBindings();

  set_binding(symbol(METAX), X);

  const arg = polyform(F, X); // collect coefficients of x, x^2, etc.
  const result = decomp(generalTransform, arg, X);

  let transformationSuccessful = false;
  let B: U;
  if (generalTransform) {
    // "general tranform" mode is supposed to be more generic than
    // "integrals" mode.
    // In general transform mode we get only one transformation
    // in s

    // simple numbers can end up matching complicated templates,
    // which we don't want.
    // for example "1" ends up matching "inner(transpose(a_),a_)"
    // since "1" is decomposed to "1" and replacing "a_" with "1"
    // there is a match.
    // Although this match is OK at some fundamental level, we want to
    // avoid it because that's not what the spirit of this match
    // is: "1" does not have any structural resemblance with
    // "inner(transpose(a_),a_)". There are probably better ways
    // to so this, for example we might notice that "inner" is an
    // anchor since it "sits above" any meta variables, so we
    // might want to mandate it to be matched at the top
    // of the tree. For the time
    // being let's just skip matching on simple numbers.
    if (!isNumericAtom(F)) {
      const theTransform = s as U;

      // replacements of meta variables. Note that we don't
      // use scan_meta because the pattern is not a string
      // that we have to parse, it's a tree already.
      // replace a_ with METAA in the passed transformation
      let expr = subst(
        theTransform,
        symbol(SYMBOL_A_UNDERSCORE),
        symbol(METAA)
      );

      // replace b_ with METAB in the passed transformation
      expr = subst(expr, symbol(SYMBOL_B_UNDERSCORE), symbol(METAB));

      // replace x_ with METAX in the passed transformation
      const p1 = subst(expr, symbol(SYMBOL_X_UNDERSCORE), symbol(METAX));

      const A = car(p1);
      B = cadr(p1);
      const C = cddr(p1);

      if (f_equals_a([Constants.one, ...result], generalTransform, F, A, C)) {
        // successful transformation, transformed result is in p6
        transformationSuccessful = true;
      } else {
        // the match failed but perhaps we can match something lower down in
        // the tree, so let's recurse the tree

        const transformedTerms: U[] = [];

        let restTerm: U = F;

        if (iscons(restTerm)) {
          transformedTerms.push(car(F));
          restTerm = cdr(F);
        }

        while (iscons(restTerm)) {
          const secondTerm = car(restTerm);
          restTerm = cdr(restTerm);

          const [t, success] = transform(
            secondTerm,
            symbol(NIL),
            s,
            generalTransform
          );
          transformationSuccessful = transformationSuccessful || success;

          transformedTerms.push(t);
        }

        // recreate the tree we were passed,
        // but with all the terms being transformed
        if (transformedTerms.length !== 0) {
          B = makeList(...transformedTerms);
        }
      }
    }
  } else {
    // "integrals" mode
    for (let eachTransformEntry of Array.from(s as string[])) {
      if (eachTransformEntry) {
        const temp = scan_meta(eachTransformEntry as string);

        const p5 = cadr(temp);
        B = caddr(temp);
        const p7 = cdddr(temp);

        if (
          f_equals_a([Constants.one, ...result], generalTransform, F, p5, p7)
        ) {
          // there is a successful transformation, transformed result is in p6
          transformationSuccessful = true;
          break;
        }
      }
    }
  }

  const temp = transformationSuccessful
    ? Eval(B)
    : generalTransform
    ? F
    : symbol(NIL);

  restoreMetaBindings(state);

  return [temp, transformationSuccessful];
}

interface TransformState {
  METAA: U;
  METAB: U;
  METAX: U;
}

function saveMetaBindings(): TransformState {
  return {
    METAA: get_binding(symbol(METAA)),
    METAB: get_binding(symbol(METAB)),
    METAX: get_binding(symbol(METAX)),
  };
}

function restoreMetaBindings(state: TransformState) {
  set_binding(symbol(METAX), state.METAX);
  set_binding(symbol(METAB), state.METAB);
  set_binding(symbol(METAA), state.METAA);
}

// search for a METAA and METAB such that F = A
function f_equals_a(
  stack: U[],
  generalTransform: boolean,
  F: U,
  A: U,
  C: U
): boolean {
  for (const fea_i of stack) {
    set_binding(symbol(METAA), fea_i);
    for (const fea_j of stack) {
      set_binding(symbol(METAB), fea_j);
      // now test all the conditions (it's an and between them)
      let temp = C;
      while (iscons(temp)) {
        const p2 = Eval(car(temp));
        if (isZeroAtomOrTensor(p2)) {
          break;
        }
        temp = cdr(temp);
      }

      if (iscons(temp)) {
        // conditions are not met, skip to the next binding of metas
        continue;
      }
      const arg2 = generalTransform ? noexpand(Eval, A) : Eval(A);
      if (isZeroAtomOrTensor(subtract(F, arg2))) {
        return true; // yes
      }
    }
  }
  return false; // no
}
