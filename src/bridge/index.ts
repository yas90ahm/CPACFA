/**
 * Protocol Bridge — single entrypoint for financial mutations.
 */

export {
  executeBridgeCommand,
  bridgeCommandSchema,
  type BridgeContext,
  type BridgeCommand,
  type BridgeResult,
  BridgeError,
} from './protocol_bridge.js';
