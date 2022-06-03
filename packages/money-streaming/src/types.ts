/**
 * Solana
 */
import { Commitment, PublicKey } from "@solana/web3.js";

declare global {
  export interface String {
    toPublicKey(): PublicKey;
  }
}

/**
 * MSP Instructions types
 */
export enum MSP_ACTIONS {
  scheduleOneTimePayment = 1,
  createStream = 2,
  createStreamWithFunds = 3,
  addFunds = 4,
  withdraw = 5,
  pauseStream = 6,
  resumeStream = 7,
  proposeUpdate = 8,
  answerUpdate = 9,
  createTreasury = 10,
  closeStream = 11,
  wrap = 12,
  swap = 13,
}

/**
 * Transaction fees
 */
export type TransactionFees = {
  /* Solana fees calculated based on the tx signatures and cluster */
  blockchainFee: number;
  /* MSP flat fee amount depending of the instruction that is being executed */
  mspFlatFee: number;
  /* MSP fee amount in percent depending of the instruction that is being executed */
  mspPercentFee: number;
};

/**
 * Transaction fees parameters
 */
export type TransactionFeesParams = {
  instruction: MSP_ACTIONS;
  signaturesAmount: number;
};

/**
 * Transaction message
 */
export type TransactionMessage = {
  action: string;
  description: string;
  amount: number;
  fees: TransactionFees;
};

export interface ListStreamParams {
  treasurer?: PublicKey | undefined,
  treasury?: PublicKey | undefined,
  beneficiary?: PublicKey | undefined,
  commitment?: Commitment,
  friendly?: boolean
}

/**
 * Stream activity
 */
export type StreamActivity = {
  signature: string;
  initializer: string;
  action: string;
  amount: number;
  mint: string;
  blockTime: number;
  utcDate: string;
};

/**
 * Treasury type
 */
export enum TreasuryType {
  Open = 0,
  Lock = 1
}

/**
 * TreasuryV2 info
 */
 export type TreasuryInfo = {
  id: PublicKey | string,
  initialized: boolean,
  slot: number,
  treasurerAddress: PublicKey | string,
  associatedTokenAddress: PublicKey | string,
  mintAddress: PublicKey | string,
  label: string,
  balance: number,
  allocationReserved: number,
  allocationLeft: number,
  allocationAssigned: number,
  streamsAmount: number,
  upgradeRequired: boolean,
  createdOnUtc: Date | string,
  depletionRate: number,
  type: TreasuryType,
  autoClose: boolean
};

/**
 * Stream states
 */
export enum STREAM_STATE {
  Schedule = 1,
  Running = 2,
  Paused = 3
}

/**
 * Allocation type
 */
 export enum AllocationType {
  All = 0,
  Specific = 1,
  None = 2
}

/**
 * Stream info
 */
 export type StreamInfo = {
  id: PublicKey | string | undefined,
  initialized: boolean,
  streamName: String,
  treasurerAddress: PublicKey | string | undefined,
  rateAmount: number,
  rateIntervalInSeconds: number,
  allocationReserved: number,
  allocationLeft: number,
  allocationAssigned: number,
  fundedOnUtc: Date | string | undefined,
  startUtc: Date | string | undefined,
  rateCliffInSeconds: number,
  cliffVestAmount: number,
  cliffVestPercent: number,
  beneficiaryAddress: PublicKey | string | undefined,
  associatedToken: PublicKey | string | undefined,
  escrowVestedAmount: number,
  escrowUnvestedAmount: number,
  treasuryAddress: PublicKey | string | undefined,
  escrowEstimatedDepletionUtc: Date | string | undefined,
  escrowVestedAmountSnap: number,
  escrowVestedAmountSnapSlot: number,
  escrowVestedAmountSnapBlockTime: number,
  streamResumedSlot: number,
  streamResumedBlockTime: number,
  autoPauseInSeconds: number,
  isUpdatePending: boolean,
  // transactionSignature: string | undefined,
  createdBlockTime: number,
  lastRetrievedBlockTime: number,
  upgradeRequired: boolean,
  state: STREAM_STATE,
  version: number,
};