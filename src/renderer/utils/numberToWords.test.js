import test from 'node:test'
import assert from 'node:assert/strict'
import { numberToWords, pesoAmountInWords } from './numberToWords.js'

test('spells out whole numbers across scales', () => {
  assert.equal(numberToWords(0), 'ZERO')
  assert.equal(numberToWords(5), 'FIVE')
  assert.equal(numberToWords(21), 'TWENTY-ONE')
  assert.equal(numberToWords(100), 'ONE HUNDRED')
  assert.equal(numberToWords(31705), 'THIRTY-ONE THOUSAND SEVEN HUNDRED FIVE')
  assert.equal(numberToWords(1000000), 'ONE MILLION')
  assert.equal(numberToWords(210718), 'TWO HUNDRED TEN THOUSAND SEVEN HUNDRED EIGHTEEN')
})

test('formats peso amounts to match the CS Form 33-B sample', () => {
  assert.equal(pesoAmountInWords(31705), 'THIRTY-ONE THOUSAND SEVEN HUNDRED FIVE PESOS')
  assert.equal(pesoAmountInWords(1500.5), 'ONE THOUSAND FIVE HUNDRED PESOS AND 50/100')
  assert.equal(pesoAmountInWords('45694'), 'FORTY-FIVE THOUSAND SIX HUNDRED NINETY-FOUR PESOS')
})
