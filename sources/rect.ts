import {
  ASSUME_REAL_VARIABLES,
  cadr,
  Constants,
  COS,
  isadd,
  ismultiply,
  issymbol,
  SIN,
  U,
  YYRECT
} from '../runtime/defs';
import {
  Find,
  findPossibleClockForm,
  findPossibleExponentialForm
} from '../runtime/find';
import { get_binding, symbol } from '../runtime/symbol';
import { abs } from './abs';
import { add } from './add';
import { arg } from './arg';
import { cosine } from './cos';
import { Eval } from './eval';
import { isimaginaryunit, isZeroAtomOrTensor } from './is';
import { makeList } from './list';
import { multiply } from './multiply';
import { sine } from './sin';

/*
Convert complex z to rectangular form

  Input:    push  z

  Output:    Result on stack
*/
export function Eval_rect(p1: U) {
  return rect(Eval(cadr(p1)));
}

export function rect(p1: U): U {
  const input = p1;

  // if we assume real variables, then the
  // rect of any symbol is the symbol itself
  // (note that 'i' is not a symbol, it's made of (-1)^(1/2))
  // otherwise we have to leave unevalled
  if (issymbol(p1)) {
    if (!isZeroAtomOrTensor(get_binding(symbol(ASSUME_REAL_VARIABLES)))) {
      return p1;
    }

    return makeList(symbol(YYRECT), p1);

    // TODO this is quite dirty, ideally we don't need this
    // but removing this creates a few failings in the tests
    // that I can't investigate right now.
    // --
    // if we assume all variables are real AND
    // it's not an exponential nor a polar nor a clock form
    // THEN rect(_) = _
    // note that these matches can be quite sloppy, one can find expressions
    // which shouldn't match but do
    //
  }

  if (
    !isZeroAtomOrTensor(get_binding(symbol(ASSUME_REAL_VARIABLES))) &&
    !findPossibleExponentialForm(p1) && // no exp form?
    !findPossibleClockForm(p1, p1) && // no clock form?
    !(
      Find(p1, symbol(SIN)) &&
      Find(p1, symbol(COS)) &&
      Find(p1, Constants.imaginaryunit)
    )
  ) {
    // no polar form?
    return p1; // ib
  }

  if (
    ismultiply(p1) &&
    isimaginaryunit(cadr(p1)) &&
    !isZeroAtomOrTensor(get_binding(symbol(ASSUME_REAL_VARIABLES)))
  ) {
    return p1; // sum
  }

  if (isadd(p1)) {
    return p1.tail().reduce((a: U, b: U) => add(a, rect(b)), Constants.zero);
  }

  // try to get to the rectangular form by doing
  // abs(p1) * (cos (theta) + i * sin(theta))
  // where theta is arg(p1)
  // abs(z) * (cos(arg(z)) + i sin(arg(z)))
  return multiply(
    abs(p1),
    add(cosine(arg(p1)), multiply(Constants.imaginaryunit, sine(arg(p1))))
  );
}
