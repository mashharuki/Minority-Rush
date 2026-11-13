import { decodeFunctionData, getAddress, parseAbi, toFunctionSelector, type Hex } from 'viem'

export const SEPOLIA_CHAIN_ID = 11155111
/** ERC-4337 EntryPoint v0.7. */
export const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0e10E02B8F8F6d'
/** permissionless.js SimpleAccountFactory for EntryPoint v0.7. */
export const SIMPLE_ACCOUNT_FACTORY_V07 = '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985'

export const MAX_CALLS = 4
export const MAX_GAS_FIELD = 5_000_000n

const accountAbi = parseAbi([
  'function execute(address dest, uint256 value, bytes func)',
  'function executeBatch(address[] dest, uint256[] value, bytes[] func)',
])

export type Call = { to: `0x${string}`; value: bigint; data: Hex }

export type UserOpLike = {
  sender: string
  callData: Hex
  factory?: string | null
  callGasLimit?: Hex | string
  verificationGasLimit?: Hex | string
  preVerificationGas?: Hex | string
}

export type Allowlist = { chip: `0x${string}`; game: `0x${string}` }

export type Validation = { ok: true } | { ok: false; reason: string }

const sel = (signature: string): Hex => toFunctionSelector(signature)

const CHIP_SELECTORS = new Set<Hex>([
  sel('faucet()'),
  sel('setOperator(address,uint48)'),
  sel('setObserver(address,address)'),
])
const GAME_SELECTORS = new Set<Hex>([
  sel('startRound()'),
  sel('enter(uint256,bytes32,bytes32,bytes)'),
  sel('closeRound(uint256)'),
  sel('finalizeRound(uint256,bool,bytes)'),
  sel('claim(uint256)'),
])

/** Decodes SimpleAccount v0.7 `execute` / `executeBatch` call data. Returns null if it is neither. */
export function decodeCalls(callData: Hex): Call[] | null {
  try {
    const decoded = decodeFunctionData({ abi: accountAbi, data: callData })
    if (decoded.functionName === 'execute') {
      const [to, value, data] = decoded.args
      return [{ to, value, data }]
    }
    const [dests, values, datas] = decoded.args
    if (dests.length !== values.length || dests.length !== datas.length) return null
    return dests.map((to, i) => ({ to, value: values[i] as bigint, data: datas[i] as Hex }))
  } catch {
    return null
  }
}

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

function validateCall(call: Call, sender: string, allow: Allowlist): Validation {
  if (call.value !== 0n) return { ok: false, reason: 'value transfers are not sponsored' }
  const selector = call.data.slice(0, 10).toLowerCase() as Hex
  if (sameAddress(call.to, allow.chip)) {
    if (!CHIP_SELECTORS.has(selector)) return { ok: false, reason: 'chip function not allowed' }
    return validateChipArgs(call, selector, sender, allow)
  }
  if (sameAddress(call.to, allow.game)) {
    return GAME_SELECTORS.has(selector) ? { ok: true } : { ok: false, reason: 'game function not allowed' }
  }
  return { ok: false, reason: 'target not allowed' }
}

/** setOperator may only name the game; setObserver may only act on the sender's own account. */
function validateChipArgs(call: Call, selector: Hex, sender: string, allow: Allowlist): Validation {
  const abi = parseAbi([
    'function setOperator(address operator, uint48 until)',
    'function setObserver(address account, address newObserver)',
  ])
  if (selector === sel('setOperator(address,uint48)')) {
    const { args } = decodeFunctionData({ abi, data: call.data })
    return sameAddress(args[0] as string, allow.game) ? { ok: true } : { ok: false, reason: 'operator must be the game' }
  }
  if (selector === sel('setObserver(address,address)')) {
    const { args } = decodeFunctionData({ abi, data: call.data })
    return sameAddress(args[0] as string, sender) ? { ok: true } : { ok: false, reason: 'observer only for own account' }
  }
  return { ok: true }
}

function gasWithinLimits(op: UserOpLike): boolean {
  const fields = [op.callGasLimit, op.verificationGasLimit, op.preVerificationGas]
  return fields.every((f) => f === undefined || BigInt(f) <= MAX_GAS_FIELD)
}

/** Decides whether a UserOperation may be sponsored. Pure: no I/O. */
export function validateUserOp(op: UserOpLike, allow: Allowlist): Validation {
  try {
    getAddress(op.sender)
  } catch {
    return { ok: false, reason: 'invalid sender' }
  }
  if (op.factory && !sameAddress(op.factory, SIMPLE_ACCOUNT_FACTORY_V07)) {
    return { ok: false, reason: 'factory not allowed' }
  }
  if (!gasWithinLimits(op)) return { ok: false, reason: 'gas limit too high' }
  const calls = decodeCalls(op.callData)
  if (!calls || calls.length === 0) return { ok: false, reason: 'unsupported call data' }
  if (calls.length > MAX_CALLS) return { ok: false, reason: 'too many calls' }
  for (const call of calls) {
    const result = validateCall(call, op.sender, allow)
    if (!result.ok) return result
  }
  return { ok: true }
}
