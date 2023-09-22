import { cadr, Constants, U } from '../runtime/defs';
import { subtract } from './add';
import { integer } from './bignum';
import { conjugate } from './conj';
import { Eval } from './eval';
import { divide } from './multiply';
import { rect } from './rect';

/*
 Returns the coefficient of the imaginary part of complex z

  z    imag(z)
  -    -------

  a + i b    b

  exp(i a)  sin(a)
*/

export function Eval_imag(p1: U) {
  return imag(Eval(cadr(p1)));
}

export function imag(p: U): U {
  const p1 = rect(p);
  const conj = conjugate(p1);
  const arg1 = divide(subtract(p1, conj), integer(2));
  return divide(arg1, Constants.imaginaryunit);
}
