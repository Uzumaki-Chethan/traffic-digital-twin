import { describe, expect, it } from 'vitest'
import { EXPRESSIONS, expressionFor } from '../zenFace'

describe('expressionFor (Zen speaks with his eyes only)', () => {
  it('sleeping and yawning are sleepy; held and dizzy are surprised', () => {
    expect(expressionFor('sleep', 'sleepy')).toBe('sleepy')
    expect(expressionFor('yawn', 'happy')).toBe('sleepy')
    expect(expressionFor('held', 'curious')).toBe('surprised')
    expect(expressionFor('dizzy', 'curious')).toBe('surprised')
  })
  it('a cheer is excited, a dance is laughing, a look around is curious', () => {
    expect(expressionFor('cheer', 'happy')).toBe('excited')
    expect(expressionFor('dance', 'disco')).toBe('laughing')
    expect(expressionFor('look', 'curious')).toBe('curious')
  })
  it('worry reads as thinking, a blush as peaceful, and idle follows the mood', () => {
    expect(expressionFor('worried', 'sad')).toBe('thinking')
    expect(expressionFor('blush', 'happy')).toBe('peaceful')
    expect(expressionFor('idle', 'happy')).toBe('happy')
    expect(expressionFor('idle', 'curious')).toBe('curious')
    expect(expressionFor('idle', 'sad')).toBe('thinking')
  })
  it('offers the whole set from the design sheet', () => {
    expect([...EXPRESSIONS].toSorted()).toEqual(['angry', 'curious', 'excited', 'happy', 'laughing', 'peaceful', 'sleepy', 'surprised', 'thinking'])
  })
})
