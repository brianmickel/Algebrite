import {
  ADD,
  car,
  cdr,
  Cons,
  Constants,
  Double,
  isadd,
  ismultiply,
  isNumericAtom,
  istensor,
  MULTIPLY,
  NIL,
  Num,
  Sign,
  Tensor,
  U
} from '../runtime/defs';
import { check_esc_flag } from '../runtime/run';
import { symbol } from "../runtime/symbol";
import { add_numbers } from './bignum';
import { Eval } from './eval';
import { isZeroAtom, isZeroAtomOrTensor } from './is';
import { makeList } from './list';
import { cmp_expr, equal } from './misc';
import { multiply, negate } from './multiply';
import { tensor_plus_tensor } from './tensor';

/*
 Symbolic addition

  Terms in a sum are combined if they are identical modulo rational
  coefficients.

  For example, A + 2A becomes 3A.

  However, the sum A + sqrt(2) A is not modified.

  Combining terms can lead to second-order effects.

  For example, consider the case of

    1/sqrt(2) A + 3/sqrt(2) A + sqrt(2) A

  The first two terms are combined to yield 2 sqrt(2) A.

  This result can now be combined with the third term to yield

    3 sqrt(2) A
*/

let flag = 0;

export function Eval_add(p1: Cons) {
  const terms: U[] = [];
  p1 = cdr(p1) as Cons;
  for (const t of p1) {
    const p2 = Eval(t);
    pushTerms(terms, p2);
  }
  return addTerms(terms);
}

// Add terms, returns one expression.
function addTerms(terms: U[]): U {
  // ensure no infinite loop, use "for"

  let i = 0;
  let hasCombinableTerms = true;
  while (i < 10 && terms.length > 1) {
    hasCombinableTerms = sortInPlace(terms);
    if (!hasCombinableTerms) {
      break;
    }
    combineTerms(terms);
  }

  switch (terms.length) {
    case 0:
      return Constants.Zero();
    case 1:
      return terms[0];
    default:
      terms.unshift(symbol(ADD));
      return makeList(...terms);
  }
}

/**
 * Sorts an array of terms in place and checks if there are any combinable terms.
 *
 * @param {U[]} terms - The array of terms to be sorted.
 * @return {boolean} - Returns true if there are any combinable terms, otherwise false.
 */
function sortInPlace(terms: U[]): boolean {
  let hasCombinableTerms = false;
  const wrappedCompareTerms = (p1: U, p2: U): Sign => {
    const result = compareTerms(p1, p2);
    if (result === 0) {
      hasCombinableTerms = true;
    }
    return result;
  }

  terms.sort(wrappedCompareTerms);
  return hasCombinableTerms;
}

// Compare terms for order.
function compareTerms(p1: U, p2: U): Sign {
  // numbers can be combined
  if (isNumericAtom(p1) && isNumericAtom(p2)) {
    return 0;
  }

  // congruent tensors can be combined
  if (istensor(p1) && istensor(p2)) {
    return compareTensorDimensions(p1, p2);
  }

  if (ismultiply(p1)) {
    p1 = unwrapMultiply(p1);
  }

  if (ismultiply(p2)) {
    p2 = unwrapMultiply(p2);
  }

  return cmp_expr(p1, p2);
}


/**
 * Compares the dimensions of two tensors and returns a sign indicating their relative sizes.
 *
 * @param {Tensor<U>} t1 - The first tensor to compare.
 * @param {Tensor<U>} t2 - The second tensor to compare.
 * @return {Sign} The sign indicating the relative sizes of the tensors. Returns -1 if t1 is smaller, 1 if t2 is smaller, and 0 if they have the same size.
 */
function compareTensorDimensions(t1: Tensor<U>, t2: Tensor<U>): Sign {
  if (t1.tensor.ndim < t2.tensor.ndim) {
    return -1;
  }
  if (t1.tensor.ndim > t2.tensor.ndim) {
    return 1;
  }
  for (let i = 0; i < t1.tensor.ndim; i++) {
    if (t1.tensor.dim[i] < t2.tensor.dim[i]) {
      return -1;
    }
    if (t1.tensor.dim[i] > t2.tensor.dim[i]) {
      return 1;
    }
  }
  return 0;
}

function unwrapMultiply(p: U): U {
  p = cdr(p);
  if (!isNumericAtom(car(p))) {
    return p;
  }
  p = cdr(p);
  if (cdr(p) !== symbol(NIL)) {
    return p;
  }
  return car(p)
}

/*
 Compare adjacent terms in terms[] and combine if possible.
*/
function combineTerms(terms: U[]): void {
  // I had to turn the coffeescript for loop into
  // a more mundane while loop because the i
  // variable was changed from within the body,
  // which is something that is not supposed to
  // happen in the coffeescript 'vector' form.
  // Also this means I had to add a 'i++' jus before
  // the end of the body and before the "continue"s
  let i = 0;
  while (i < terms.length - 1) {
    check_esc_flag();
    let p1: U, p2: U;
    let p3 = terms[i];
    let p4 = terms[i + 1];

    if (istensor(p3) && istensor(p4)) {
      const added = tensor_plus_tensor(p3, p4);
      if (added !== symbol(NIL)) {
        terms.splice(i, 2, added);
        i--;
      }
      i++;
      continue;
    }

    if (istensor(p3) || istensor(p4)) {
      i++;
      continue;
    }

    if (isNumericAtom(p3) && isNumericAtom(p4)) {
      const added = add_numbers(p3, p4);
      if (isZeroAtomOrTensor(added)) {
        terms.splice(i, 2);
      } else {
        terms.splice(i, 2, added);
      }
      continue;
    }

    if (isNumericAtom(p3) || isNumericAtom(p4)) {
      i++;
      continue;
    }

    p1 = Constants.One();
    p2 = Constants.One();

    let t = 0;

    if (ismultiply(p3)) {
      p3 = cdr(p3);
      t = 1; // p3 is now denormal
      if (isNumericAtom(car(p3))) {
        p1 = car(p3);
        p3 = cdr(p3);
        if (cdr(p3) === symbol(NIL)) {
          p3 = car(p3);
          t = 0;
        }
      }
    }

    if (ismultiply(p4)) {
      p4 = cdr(p4);
      if (isNumericAtom(car(p4))) {
        p2 = car(p4);
        p4 = cdr(p4);
        if (cdr(p4) === symbol(NIL)) {
          p4 = car(p4);
        }
      }
    }

    if (!equal(p3, p4)) {
      i++;
      continue;
    }

    p1 = add_numbers(p1 as Num | Double, p2 as Num | Double);

    if (isZeroAtomOrTensor(p1)) {
      terms.splice(i, 2);
      continue;
    }

    const arg2 = t ? new Cons(symbol(MULTIPLY), p3) : p3;

    terms.splice(i, 2, multiply(p1, arg2));
  }
}

function pushTerms(array: U[], p: U) {
  if (isadd(p)) {
    array.push(...p.tail());
  } else if (!isZeroAtom(p)) {
    // omit zeroes
    array.push(p);
  }
}

// add two expressions
export function add(p1: U, p2: U): U {
  const terms: U[] = [];
  pushTerms(terms, p1);
  pushTerms(terms, p2);
  return addTerms(terms);
}

export function add_all(terms: U[]): U {
  const flattened: U[] = [];
  for (const t of terms) {
    pushTerms(flattened, t);
  }
  return addTerms(flattened);
}

export function subtract(p1: U, p2: U): U {
  return add(p1, negate(p2));
}
