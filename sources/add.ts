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
    terms = combineTerms(terms);
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
function combineTerms(terms: U[]): U[] {
  const evaluated: U[] = [];
  const remaining: U[] = [...terms];
  while (remaining.length > 1) {
    check_esc_flag();
    let p1 = remaining.shift();
    let p2 = remaining.shift();
    if (istensor(p1) && istensor(p2)) {
      const added = tensor_plus_tensor(p1, p2);
      if (added !== symbol(NIL)) {
        evaluated.push(added);
        continue;
      }
      evaluated.push(p1);
      remaining.unshift(p2);
    } else if (istensor(p1) || istensor(p2)) {
      evaluated.push(p1);
      remaining.unshift(p2);
    } else if (isNumericAtom(p1) && isNumericAtom(p2)) {
      const added = add_numbers(p1, p2);
      if (!isZeroAtomOrTensor(added)) {
        remaining.unshift(added)
      }
      continue;
    } else if (isNumericAtom(p1) || isNumericAtom(p2)) {
      evaluated.push(p1);
      remaining.unshift(p2);
    } else {
      let d1: U = Constants.One();
      let d2: U = Constants.One();
      let p1a: U = p1
      let p2a: U = p2;
      let t = false;
      if (ismultiply(p1)) {
        [p1a, d1, t] = needDescriptiveFunctionName(p1)
      }

      if (ismultiply(p2)) {
        let _ = false;
        [p2a, d2, _] = needDescriptiveFunctionName(p2);
      }

      if (!equal(p1a, p2a)) {
        evaluated.push(p1);
        remaining.unshift(p2);
        continue;
      }

      d1 = add_numbers(d1 as Num | Double, d2 as Num | Double);

      if (isZeroAtomOrTensor(d1)) {
        continue;
      }

      const arg2 = t ? new Cons(symbol(MULTIPLY), p1a) : p1a;
      const result = multiply(d1, arg2);
      remaining.unshift(result);
    }
  }
  return [...evaluated, ...remaining];
}

function needDescriptiveFunctionName(p: U): [U, U, boolean] {
  let n: U = Constants.One();
  p = cdr(p);
  let t = true; // p is now denormal
  if (isNumericAtom(car(p))) {
    n = car(p);
    p = cdr(p);
    if (cdr(p) === symbol(NIL)) {
      p = car(p);
      t = false;
    }
  }
  return [p, n, t];
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
