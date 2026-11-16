import { encodeFunctionData, parseAbi, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  ENTRY_POINT_V07,
  MAX_CALLS,
  SIMPLE_ACCOUNT_FACTORY_V07,
  validateUserOp,
  type Allowlist,
  type Call,
} from './validate'

const CHIP = '0x011B6b4b58738a93D123d129Ee7E1a5B0B1A50F2' as const
const GAME = '0x0B12A3748f8E97F01ab9c077b5c39d97Df28aBA6' as const
const SENDER = '0x1111111111111111111111111111111111111111' as const
const OTHER = '0x2222222222222222222222222222222222222222' as const
const allow: Allowlist = { chip: CHIP, game: GAME }

const account = parseAbi([
  'function execute(address dest, uint256 value, bytes func)',
  'function executeBatch(address[] dest, uint256[] value, bytes[] func)',
])
const chipAbi = parseAbi([
  'function faucet()',
  'function setOperator(address operator, uint48 until)',
  'function setObserver(address account, address newObserver)',
  'function confidentialTransfer(address to, bytes32 amount, bytes proof)',
])
const gameAbi = parseAbi([
  'function createTable(address opponent)',
  'function joinTable(uint256 id)',
  'function cancelTable(uint256 id)',
  'function act(uint256 id, uint8 action)',
  'function claimTimeout(uint256 id)',
  'function confirmFunds(uint256 id, bool okA, bool okB, bytes proof)',
  'function finalizeShowdown(uint256 id, bool aWins, bytes proof)',
  'function startRound()',
  'function enter(uint256 roundId, bytes32 choice, bytes32 stake, bytes proof)',
])

const call = (to: `0x${string}`, data: Hex, value = 0n): Call => ({ to, data, value })

function callData(calls: Call[]): Hex {
  if (calls.length === 1) {
    const [c] = calls as [Call]
    return encodeFunctionData({ abi: account, functionName: 'execute', args: [c.to, c.value, c.data] })
  }
  return encodeFunctionData({
    abi: account,
    functionName: 'executeBatch',
    args: [calls.map((c) => c.to), calls.map((c) => c.value), calls.map((c) => c.data)],
  })
}

const faucet = call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'faucet' }))
const op = (calls: Call[], extra: object = {}) => ({ sender: SENDER, callData: callData(calls), ...extra })

describe('constants', () => {
  it('should use the canonical EntryPoint v0.7 and SimpleAccount v0.7 factory addresses', () => {
    // Regression: a mistyped EntryPoint made the sponsor API reject every real request.
    expect(ENTRY_POINT_V07).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032')
    expect(SIMPLE_ACCOUNT_FACTORY_V07).toBe('0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985')
  })
})

describe('validateUserOp', () => {
  it('should accept a single allowed call', () => {
    expect(validateUserOp(op([faucet]), allow)).toEqual({ ok: true })
  })

  it('should accept the onboarding batch (faucet, operator, observer)', () => {
    const batch = [
      faucet,
      call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'setOperator', args: [GAME, 1_900_000_000] })),
      call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'setObserver', args: [SENDER, OTHER] })),
    ]
    expect(validateUserOp(op(batch, { factory: SIMPLE_ACCOUNT_FACTORY_V07 }), allow)).toEqual({ ok: true })
  })

  it.each([
    ['createTable', [OTHER]],
    ['joinTable', [1n]],
    ['cancelTable', [1n]],
    ['act', [1n, 1]],
    ['claimTimeout', [1n]],
    ['confirmFunds', [1n, true, true, '0x1234']],
    ['finalizeShowdown', [1n, true, '0x1234']],
  ] as const)('should accept %s on the game', (functionName, args) => {
    const data = encodeFunctionData({ abi: gameAbi, functionName, args } as never)
    expect(validateUserOp(op([call(GAME, data)]), allow)).toEqual({ ok: true })
  })

  it.each([
    ['startRound', []],
    ['enter', [1n, `0x${'0'.repeat(64)}`, `0x${'0'.repeat(64)}`, '0x']],
  ] as const)('should reject the old %s selector on the game', (functionName, args) => {
    const data = encodeFunctionData({ abi: gameAbi, functionName, args } as never)
    expect(validateUserOp(op([call(GAME, data)]), allow)).toMatchObject({ ok: false, reason: 'game function not allowed' })
  })

  it('should accept the first-time batch of faucet, setOperator(game) and joinTable', () => {
    const batch = [
      faucet,
      call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'setOperator', args: [GAME, 1_900_000_000] })),
      call(GAME, encodeFunctionData({ abi: gameAbi, functionName: 'joinTable', args: [1n] })),
    ]
    expect(validateUserOp(op(batch), allow)).toEqual({ ok: true })
  })

  it('should reject unknown targets', () => {
    expect(validateUserOp(op([call(OTHER, '0x')]), allow)).toMatchObject({ ok: false, reason: 'target not allowed' })
  })

  it('should reject ETH value transfers', () => {
    expect(validateUserOp(op([call(CHIP, faucet.data, 1n)]), allow)).toMatchObject({ ok: false })
  })

  it('should reject selectors that are not allowlisted', () => {
    const transfer = call(
      CHIP,
      encodeFunctionData({ abi: chipAbi, functionName: 'confidentialTransfer', args: [OTHER, `0x${'0'.repeat(64)}`, '0x'] }),
    )
    expect(validateUserOp(op([transfer]), allow)).toMatchObject({ ok: false, reason: 'chip function not allowed' })
  })

  it('should reject an operator other than the game', () => {
    const bad = call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'setOperator', args: [OTHER, 1_900_000_000] }))
    expect(validateUserOp(op([bad]), allow)).toMatchObject({ ok: false, reason: 'operator must be the game' })
  })

  it("should reject setObserver for someone else's account", () => {
    const bad = call(CHIP, encodeFunctionData({ abi: chipAbi, functionName: 'setObserver', args: [OTHER, OTHER] }))
    expect(validateUserOp(op([bad]), allow)).toMatchObject({ ok: false, reason: 'observer only for own account' })
  })

  it('should reject batches above the limit', () => {
    const many = Array.from({ length: MAX_CALLS + 1 }, () => faucet)
    expect(validateUserOp(op(many), allow)).toMatchObject({ ok: false, reason: 'too many calls' })
  })

  it('should reject an unknown factory and excessive gas', () => {
    expect(validateUserOp(op([faucet], { factory: OTHER }), allow)).toMatchObject({ ok: false, reason: 'factory not allowed' })
    expect(validateUserOp(op([faucet], { callGasLimit: '0xffffffff' }), allow)).toMatchObject({
      ok: false,
      reason: 'gas limit too high',
    })
  })

  it('should reject call data that is not execute/executeBatch', () => {
    expect(validateUserOp({ sender: SENDER, callData: '0xdeadbeef' }, allow)).toMatchObject({ ok: false })
    expect(validateUserOp({ sender: 'nope', callData: faucet.data }, allow)).toMatchObject({ ok: false })
  })
})
