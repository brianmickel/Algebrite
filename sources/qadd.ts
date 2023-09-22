import { Constants, Double, MZERO, Num } from '../runtime/defs';
import { makeSignSameAs } from './bignum';
import { madd } from './madd';
import { mgcd } from './mgcd';
import { mdiv, mmul } from './mmul';

//  Add rational numbers
//
//  Input:    p1    addend
//            p2    addend
//
//  Output:    sum
export function qadd(qadd_frac1: Num, qadd_frac2: Num): Num | Double {
  // a, qadd_ab, b, qadd_ba, c are all bigNum
  // we are adding the fractions qadd_frac1 + qadd_frac2 i.e.
  // qadd_frac1.q.a/qadd_frac1.q.b + qadd_frac2.q.a/qadd_frac2.q.b
  const qadd_ab = mmul(qadd_frac1.q.a, qadd_frac2.q.b);
  const qadd_ba = mmul(qadd_frac1.q.b, qadd_frac2.q.a);

  const qadd_numerator = madd(qadd_ab, qadd_ba);

  if (MZERO(qadd_numerator)) {
    return Constants.zero;
  }

  const qadd_denominator = mmul(qadd_frac1.q.b, qadd_frac2.q.b);

  let gcdBetweenNumeratorAndDenominator = mgcd(
    qadd_numerator,
    qadd_denominator
  );

  gcdBetweenNumeratorAndDenominator = makeSignSameAs(
    gcdBetweenNumeratorAndDenominator,
    qadd_denominator
  );

  const a = mdiv(qadd_numerator, gcdBetweenNumeratorAndDenominator);
  const b = mdiv(qadd_denominator, gcdBetweenNumeratorAndDenominator);
  return new Num(a, b);
}
