import base58 from "bs58";
import base64 from "base64-js";
import { Commitment, Connection, PublicKey, ConfirmOptions, GetProgramAccountsConfig, Finality, ParsedConfirmedTransaction, PartiallyDecodedInstruction } from "@solana/web3.js";
import { BN, Idl, Program, Provider } from "@project-serum/anchor";
/**
 * MSP
 */
import MSP_IDL from './idl';
import { Constants } from "./constants";
import { StreamActivity, StreamInfo } from "./types";
import { MintLayout } from "@solana/spl-token";
import { STREAM_STATUS } from "./types";
import { TreasuryInfo, TreasuryType } from ".";

String.prototype.toPublicKey = function (): PublicKey {
  return new PublicKey(this.toString());
};

let defaultStreamActivity: StreamActivity = {
  signature: "",
  initializer: "",
  action: "",
  amount: 0,
  mint: "",
  blockTime: 0,
  utcDate: "",
};

export const createProgram = (
  connection: Connection,
  wallet: any

): Program<Idl> => {
  
  const opts: ConfirmOptions = {
    preflightCommitment: "recent",
    commitment: "recent",
  };

  const provider = new Provider(connection, wallet as any, opts);
  
  return new Program(MSP_IDL, Constants.MSP, provider);
}

export const getStream = async (
  program: Program<Idl>,
  address: PublicKey,
  commitment: Commitment = "finalized",
  friendly: boolean = true

): Promise<StreamInfo> => {
  
  let stream = await program.account.Stream.fetch(address);
  let associatedTokenInfo = await program.provider.connection.getAccountInfo(
    stream.beneficiaryAssociatedToken, 
    commitment
  );

  if (!associatedTokenInfo) {
    throw Error("Associated token doesn't exists");
  }

  let associatedToken = MintLayout.decode(Buffer.from(associatedTokenInfo.data));
  let streamInfo = parseStreamData(stream, address, associatedToken.decimals, friendly);

  return streamInfo;
}

export const getStreamCached = async (
  streamInfo: StreamInfo,
  currentBlockTime: number,
  friendly: boolean = true

): Promise<StreamInfo> => {

  const copyStreamInfo = Object.assign({}, streamInfo);

  copyStreamInfo.estimatedDepletionDate = friendly 
    ? getStreamEstDepletionDate(copyStreamInfo.data).toString() 
    : getStreamEstDepletionDate(copyStreamInfo.data);

  copyStreamInfo.fundsLeftInStream = friendly 
    ? getFundsLeftInStream(copyStreamInfo.data) / 10 ** copyStreamInfo.decimals
    : getFundsLeftInStream(copyStreamInfo.data);

  copyStreamInfo.fundsSentToBeneficiary = friendly 
    ? getFundsSentToBeneficiary(copyStreamInfo.data) / 10 ** copyStreamInfo.decimals
    : getFundsSentToBeneficiary(copyStreamInfo.data);

  copyStreamInfo.remainingAllocationAmount = friendly 
    ? getStreamRemainingAllocation(copyStreamInfo.data) / 10 ** copyStreamInfo.decimals
    : getStreamRemainingAllocation(copyStreamInfo.data);

  copyStreamInfo.withdrawableAmount = friendly 
    ? getStreamWithdrawableAmount(copyStreamInfo.data) / 10 ** copyStreamInfo.decimals
    : getStreamWithdrawableAmount(copyStreamInfo.data);

  copyStreamInfo.status = getStreamStatus(copyStreamInfo.data);
  copyStreamInfo.lastRetrievedBlockTime = currentBlockTime;

  return copyStreamInfo;
}

export const listStreams = async (
  program: Program<Idl>,
  treasurer?: PublicKey | undefined,
  treasury?: PublicKey | undefined,
  beneficiary?: PublicKey | undefined,
  commitment?: Commitment | undefined,
  friendly: boolean = true

): Promise<StreamInfo[]> => {

  let streamInfoList: StreamInfo[] = [];
  let accounts = await getFilteredStreamAccounts(program, treasurer, treasury, beneficiary, commitment);

  for (let item of accounts) {
    if (item.account.lamports > 0 && item.account.data !== undefined) {
      let stream = program.account.Stream.coder.state.decode(Buffer.from(item.account.data))
      let parsedStream = parseStreamData(stream, item.publicKey, 6);              
      let info = Object.assign({}, parsedStream);
      let signatures = await program.provider.connection.getConfirmedSignaturesForAddress2(
        friendly ? new PublicKey(info.id as string) : (info.id as PublicKey),
        { limit: 1 }, 
        'confirmed'
      );

      if (signatures.length > 0) {
        info.createdBlockTime = signatures[0].blockTime as number;
        info.transactionSignature = signatures[0].signature;
      }

      streamInfoList.push(info);
    }
  }

  let orderedStreams = streamInfoList.sort((a, b) => b.createdBlockTime - a.createdBlockTime);

  return orderedStreams;
}

export const listStreamsCached = async (
  streamInfoList: StreamInfo[],
  friendly: boolean = true

) => {

  let streamList: StreamInfo[] = [];
  const currentTime = Date.parse(new Date().toUTCString()) / 1000;

  for (let streamInfo of streamInfoList) {
    streamList.push(
      await getStreamCached(streamInfo, currentTime, friendly)
    );
  }  

  return streamList;
}

export async function listStreamActivity(
  program: Program<Idl>,
  address: PublicKey,
  commitment?: Finality | undefined,
  friendly: boolean = true

): Promise<any[]> {

  let activity: any = [];
  let finality = commitment !== undefined ? commitment : "finalized";
  let signatures = await program.provider.connection.getConfirmedSignaturesForAddress2(address, {}, finality);
  let txs = await program.provider.connection.getParsedConfirmedTransactions(signatures.map(s => s.signature), finality);
  const streamAccountInfo = await program.provider.connection.getAccountInfo(address, commitment || "finalized");

  if (!streamAccountInfo) {
    throw Error("Stream not found");
  }

  if (txs && txs.length) {
    txs.forEach(tx => {
      if (tx) {
        let item = Object.assign({}, parseStreamActivityData(program, tx.transaction.signatures[0], tx, friendly));
        if (item && item.signature) {
          activity.push(item);
        }
      }
    });
  }

  return activity.sort(
    (a: { blockTime: number }, b: { blockTime: number }) => b.blockTime - a.blockTime
  );
}

export const getTreasury = async (
  program: Program<Idl>,
  address: PublicKey,
  commitment: Commitment | undefined,
  friendly: boolean = true

): Promise<TreasuryInfo> => {

  let treasury = await program.account.Treasury.fetch(address);
  let associatedTokenInfo = await program.provider.connection.getAccountInfo(
    treasury.associatedTokenAddress, 
    commitment
  );

  if (!associatedTokenInfo) {
    throw Error("Associated token doesn't exists");
  }

  let associatedToken = MintLayout.decode(Buffer.from(associatedTokenInfo.data));
  let parsedTreasury = parseTreasuryData(treasury, address, associatedToken.decimas, friendly); 

  if (!parsedTreasury.createdOnUtc) {
    try {
      const blockTime = await program.provider.connection.getBlockTime(parsedTreasury.slot) || 0;
      parsedTreasury.createdOnUtc = blockTime === 0 
        ? "" 
        : friendly === true 
        ? new Date(blockTime * 1000).toString()
        : new Date(blockTime * 1000);
        
    } catch {}
  }

  return parsedTreasury;
}

export const listTreasuries = async (
  program: Program<Idl>,
  treasurer?: PublicKey | undefined,
  commitment?: any,
  friendly: boolean = true

) => {

  let treasuries: TreasuryInfo[] = [];
  let memcmpFilters: any[] = [];

  if (treasurer) {
    memcmpFilters.push({ memcmp: { offset: 9, bytes: treasurer.toBase58() }});
  }

  // Lookup treasuries
  const configOrCommitment: GetProgramAccountsConfig = {
    commitment: commitment || 'confirmed',
    filters: [{ dataSize: Constants.TREASURY_SIZE }, ...memcmpFilters]
  };

  const accounts = await program.provider.connection.getProgramAccounts(program.programId, configOrCommitment);

  if (accounts.length) {
    for (let item of accounts) {
      if (item.account.data !== undefined) {
        let treasury = program.account.Treasury.coder.state.decode(Buffer.from(item.account.data))
        let parsedTreasury = parseTreasuryData(treasury, item.pubkey, 6, friendly);
        let info = Object.assign({}, parsedTreasury);

        if ((treasurer && treasurer.toBase58() === info.treasurer) || !treasurer) {
          treasuries.push(info);
        }
      }
    }
  }

  const sortedTreasuries = treasuries.sort((a, b) => b.slot - a.slot);

  return sortedTreasuries;
}

const getFilteredStreamAccounts = async (
  program: Program<Idl>,
  treasurer?: PublicKey | undefined,
  treasury?: PublicKey | undefined,
  beneficiary?: PublicKey | undefined,
  commitment?: Commitment | undefined,

) => {

  let accounts: any[] = [];

  if (treasury) {

    let memcmpFilters = [{ memcmp: { offset: 185, bytes: treasury.toBase58() }}];
    const configOrCommitment: GetProgramAccountsConfig = {
      commitment,
      filters: [{ dataSize: Constants.TREASURY_SIZE }, ...memcmpFilters]
    };

    const accs = await program.provider.connection.getProgramAccounts(program.programId, configOrCommitment);
  
    if (accs.length) {
      accounts.push(...accs);
    }

  } else {

    if (treasurer) {

      let memcmpFilters = [{ memcmp: { offset: 33, bytes: treasurer.toBase58() }}];
      const configOrCommitment: GetProgramAccountsConfig = {
        commitment,
        filters: [{ dataSize: Constants.STREAM_SIZE }, ...memcmpFilters]
      };
  
      const accs = await program.provider.connection.getProgramAccounts(program.programId, configOrCommitment);
    
      if (accs.length) {
        accounts.push(...accs);
      }
    }
  
    if (beneficiary) {
  
      let memcmpFilters = [{ memcmp: { offset: 121, bytes: beneficiary.toBase58() }}];
      const configOrCommitment: GetProgramAccountsConfig = {
        commitment,
        filters: [{ dataSize: Constants.STREAM_SIZE }, ...memcmpFilters]
      };
  
      const accs = await program.provider.connection.getProgramAccounts(program.programId, configOrCommitment);
    
      if (accs.length) {
        accounts.push(...accs);
      }
    }
  }

  return accounts;
}

const parseStreamData = (
  stream: any,
  address: PublicKey,
  decimals: number,
  friendly: boolean = true

) => {

  let nameBuffer = Buffer.alloc(stream.name.length, stream.name);

  return {
    id: friendly ? address.toBase58() : address,
    version: stream.version,
    initialized: stream.initialized === 1 ? true : false,
    name: new TextDecoder().decode(nameBuffer),
    startUtc: !friendly ? new Date(stream.startUtc).toString() : new Date(stream.startUtc),
    treasurer: friendly ? stream.treasurerAddress.toBase58() : stream.treasurerAddress,
    treasury: friendly ? stream.treasuryAddress.toBase58() : stream.treasuryAddress,
    beneficiary: friendly ? stream.beneficiaryAddress.toBase58() : stream.beneficiaryAddress,
    associatedToken: friendly ? stream.associatedTokenAddress.toBase58() : stream.associatedTokenAddress,

    cliffVestAmount: friendly 
      ? stream.cliffVestAmountUnits.toNumber() / 10 ** decimals 
      : stream.cliffVestAmountUnits.toNumber(),

    cliffVestPercent: stream.cliffVestPercent.toNumber() / 10_000,
    allocationAssigned: friendly 
      ? stream.allocationAssignedUnits.toNumber() / 10 ** decimals
      : stream.allocationAssignedUnits.toNumber(),

    allocationReserved: friendly 
      ? stream.allocationReservedUnits.toNumber() / 10 ** decimals
      : stream.allocationReservedUnits.toNumber(),

    createdBlockTime: 0,
    estimatedDepletionDate: friendly 
      ? getStreamEstDepletionDate(stream).toString() : 
      getStreamEstDepletionDate(stream),

    rateAmount: friendly
      ? stream.rateAmountUnits.toNumber() / 10 ** decimals 
      : stream.rateAmountUnits.toNumber(),

    rateIntervalInSeconds: stream.rateIntervalInSeconds.toNumber(),
    totalWithdrawalsAmount: friendly
      ? stream.totalWithdrawalsUnits.toNumber() / 10 ** decimals
      : stream.totalWithdrawalsUnits.toNumber(),

    // lastWithdrawalSlot: stream.lastWithdrawalSlot.toNumber(),
    // lastWithdrawalBlockTime: stream.lastWithdrawalBlockTime.toNumber(),
    // lastWithdrawalAmount: friendly 
    //   ? stream.lastWithdrawalAmount.toNumber() / 10 ** associatedToken.decimals
    //   : stream.lastWithdrawalAmount.toNumber(),

    // lastManualStopSlot: stream.lastManualStopSlot.toNumber(),
    // lastManualStopBlockTime: stream.lastManualStopBlockTime.toNumber(),
    // lastManualStopWithdrawableSnap: friendly 
    //   ? stream.lastManualStopWithdrawableSnap.toNumber() / 10 ** associatedToken.decimals
    //   : stream.lastManualStopWithdrawableSnap.toNumber(),
    
    // lastManualResumeSlot: stream.lastManualResumeSlot.toNumber(),
    // lastManualResumeBlockTime: stream.lastManualResumeBlockTime.toNumber(),
    // lastManualResumeAllocationChangeAmount: friendly 
    //   ? stream.lastManualResumeBlockTime.toNumber() / 10 ** associatedToken.decimals
    //   : stream.lastManualResumeBlockTime.toNumber(),

    // lastKnownTotalSecondsInPause: stream.lastKnownTotalSecondsInPausedStatus.toNumber(),

    fundsLeftInStream: friendly 
      ? getFundsLeftInStream(stream) / 10 ** decimals
      : getFundsLeftInStream(stream),

    fundsSentToBeneficiary: friendly 
      ? getFundsSentToBeneficiary(stream) / 10 ** decimals
      : getFundsSentToBeneficiary(stream),

    remainingAllocationAmount: friendly 
      ? getStreamRemainingAllocation(stream) / 10 ** decimals
      : getStreamRemainingAllocation(stream),

    withdrawableAmount: friendly 
      ? getStreamWithdrawableAmount(stream) / 10 ** decimals
      : getStreamWithdrawableAmount(stream),

    status: getStreamStatus(stream),
    lastRetrievedBlockTime: new Date().getTime() / 1_000,
    transactionSignature: '',
    upgradeRequired: false,
    decimals: decimals,
    data: stream
    
  } as StreamInfo;
}

const parseStreamActivityData = (
  program: Program<Idl>,
  signature: string,
  tx: ParsedConfirmedTransaction,
  friendly: boolean = true

): StreamActivity => {

  let streamActivity: StreamActivity = defaultStreamActivity;
  let signer = tx.transaction.message.accountKeys.filter((a) => a.signer)[0];
  let instruction = tx.transaction.message.instructions.filter((ix: any) => {
    if (ix && ix.data) {
      let ixObj = program.coder.instruction.decode(ix.data);
      if (ixObj) {
        return ixObj.name === "addFunds" || ixObj.name === "withdraw";
      }
      return false;
    }
    return false;
  })[0] as PartiallyDecodedInstruction;

  if (!instruction) {
    return streamActivity;
  }
  
  let ixObj = program.coder.instruction.decode(instruction.data);

  if (ixObj && (ixObj.name === "addFunds" || ixObj.name === "withdraw")) {

    let blockTime = (tx.blockTime as number) * 1000; // mult by 1000 to add milliseconds
    let action = ixObj.name === "addFunds" ? "deposited" : "withdrew";
    let data = ixObj.data as any, amount = 0;

    if (ixObj.name === "addFunds") {
      amount = data.amount;
    } else {
      amount = data.withdrawal_amount;
    }
 
    if (amount) {
      let mint: PublicKey | string;

      if (tx.meta?.preTokenBalances?.length) {
        mint = friendly === true
          ? tx.meta.preTokenBalances[0].mint
          : new PublicKey(tx.meta.preTokenBalances[0].mint);

      } else if (tx.meta?.postTokenBalances?.length) {
        mint = friendly === true
          ? tx.meta.postTokenBalances[0].mint
          : new PublicKey(tx.meta.postTokenBalances[0].mint);

      } else {
        mint = "Unknown Token";
      }

      streamActivity = Object.assign(
        {
          signature,
          initializer: friendly === true ? signer.pubkey.toBase58() : signer.pubkey,
          blockTime,
          utcDate: new Date(blockTime).toUTCString(),
          action,
          amount: parseFloat(amount.toFixed(9)),
          mint,
        }
      );
    }
  }

  return streamActivity;

};

const parseTreasuryData = (
  treasury: any,
  address: PublicKey,
  decimals: number,
  friendly: boolean = true

) => {

  let nameBuffer = Buffer.alloc(treasury.name.length, treasury.name);

  return {
    id: friendly ? address.toBase58() : address,
    version: treasury.version,
    initialized: treasury.initialized === 1 ? true : false,
    name: new TextDecoder().decode(nameBuffer),
    bump: treasury.bump,
    slot: treasury.slot.toNumber(),
    labels: treasury.labels,
    mint: friendly ? treasury.mint.toBase58() : treasury.mint,
    autoClose: treasury.autoClose === 0 ? false : true,
    createdOnUtc: friendly 
      ? new Date(treasury.createdOnUtc.toNumber()).toString()
      : new Date(treasury.createdOnUtc.toNumber()),

    treasuryType: treasury.treasuryType === 0 ? TreasuryType.Open : TreasuryType.Lock,
    treasurer: friendly ? treasury.treasurerAddress.toBase58() : treasury.treasurerAddress,
    associatedToken: friendly ? treasury.associatedTokenAddress.toBase58() : treasury.associatedTokenAddress,
    balance: friendly 
      ? treasury.lastKnownBalanceUnits.toNumber() / 10 ** decimals 
      : treasury.lastKnownBalanceUnits.toNumber(),

    allocationReserved: friendly 
      ? treasury.allocationReservedUnits.toNumber() / 10 ** decimals 
      : treasury.allocationReservedUnits.toNumber(),

    allocationAssigned: friendly 
      ? treasury.allocationAssignedUnits.toNumber() / 10 ** decimals 
      : treasury.allocationAssignedUnits.toNumber(),

    totalWithdrawals: friendly 
      ? treasury.totalWithdrawalsUnits.toNumber() / 10 ** decimals 
      : treasury.totalWithdrawalsUnits.toNumber(),

    totalStreams: treasury.totalStreams.toNumber(),
    decimals: decimals,
    data: treasury
    
  } as TreasuryInfo;
}

const getStreamEstDepletionDate = (stream: any) => {

  if (stream.rateIntervalInSeconds == 0) {
    return new Date();
  }

  let cliffAmount = getStreamCliffAmount(stream);
  let streamableAmount = stream.allocationAssignedUnits.toNumber() - cliffAmount;
  let durationSeconds = (streamableAmount / stream.rateIntervalInSeconds) - cliffAmount;
  let estDepletionTime = stream.startUtc.toNumber() + durationSeconds;

  return new Date(estDepletionTime);
}

const getStreamCliffAmount = (stream: any) => {

  let cliffAmount = stream.cliffVestAmountUnits.toNumber();

  if (stream.cliffVestPercent > 0) {
    cliffAmount = stream.cliffVestPercent * stream.allocationAssignedUnits / 1_000_000;
  }

  return cliffAmount;
}

const getFundsLeftInStream = (stream: any) => {

  let withdrawableAmount = getStreamWithdrawableAmount(stream);
  let fundsLeft = (
    stream.allocationAssignedUnits.toNumber() -
    stream.totalWithdrawalsUnits.toNumber() -
    withdrawableAmount
  );

  return fundsLeft;
}

const getFundsSentToBeneficiary = (stream: any) => {

  let withdrawableAmount = getStreamWithdrawableAmount(stream);
  let fundsSent = (
    stream.totalWithdrawalsUnits.toNumber() +
    withdrawableAmount
  );

  return fundsSent;
}

const getStreamRemainingAllocation = (stream: any) => {
  return stream.allocationAssignedUnits.toNumber() - stream.totalWithdrawalsUnits.toNumber();
}

const getStreamWithdrawableAmount = (stream: any) => {

  let remainingAllocation = getStreamRemainingAllocation(stream);

  if (remainingAllocation === 0) {
    return 0;
  }

  let status = getStreamStatus(stream);

  // Check if SCHEDULED
  if (status === STREAM_STATUS.Schedule) {
    return 0;
  }

  // Check if PAUSED
  if (status === STREAM_STATUS.Paused) {
    let manuallyPaused = isStreamManuallyPaused(stream);
    let withdrawableWhilePausedAmount = manuallyPaused 
      ? stream.lastManualStopWithdrawableUnitsSnap.toNumber()
      : stream.allocationAssignedUnits.toNumber() - stream.totalWithdrawalsUnits.toNumber();

    return withdrawableWhilePausedAmount;
  }

  // Check if RUNNING
  if (stream.rateAmountUnits.toNumber() === 0 || stream.rateIntervalInSeconds.toNumber() === 0) {
    throw Error("Invalid stream data");
  }

  let streamedUnitsPerSecond = getStreamUnitsPerSecond(stream);
  let cliffAmount = getStreamCliffAmount(stream);
  let now = new Date();
  let timeSinceStart = now.getTime() - stream.startUtc.toNumber();
  let nonStopEarningUnits = cliffAmount + (streamedUnitsPerSecond * timeSinceStart);
  let missedEarningUnitsWhilePaused = 
    streamedUnitsPerSecond * stream.lastKnownTotalSecondsInPausedStatus.toNumber();

  let entitledEarnings = nonStopEarningUnits - missedEarningUnitsWhilePaused;
  let withdrawableUnitsWhileRunning = entitledEarnings - stream.totalWithdrawalsUnits.toNumber();
  let withdrawableAmount = Math.min(remainingAllocation, withdrawableUnitsWhileRunning);

  return withdrawableAmount;
}

const getStreamStatus = (stream: any) => {

  let now = new Date();
  let startTime = stream.startUtc.toNumber();

  // Scheduled
  if (startTime > now.getTime()) { 
    return STREAM_STATUS.Schedule;
  }

  // Manually paused
  let manuallyPaused = isStreamManuallyPaused(stream);

  if (manuallyPaused) {
    return STREAM_STATUS.Paused;
  }

  // Running or automatically paused (ran out of funds)
  let streamedUnitsPerSecond = getStreamUnitsPerSecond(stream);
  let cliffAmount = getStreamCliffAmount(stream);
  let timeSinceStart = now.getTime() - startTime;
  let nonStopEarningUnits = cliffAmount + (streamedUnitsPerSecond * timeSinceStart);
  let missedEarningUnitsWhilePaused = 
    streamedUnitsPerSecond * stream.lastKnownTotalSecondsInPausedStatus.toNumber();

  let entitledEarnings = nonStopEarningUnits - missedEarningUnitsWhilePaused;
  // Running
  if (stream.allocationAssignedUnits.toNumber() > entitledEarnings) {
    return STREAM_STATUS.Running;
  }

  // Automatically paused (ran out of funds)
  return STREAM_STATUS.Paused;
}

const isStreamManuallyPaused = (stream: any) => {
  if (stream.lastManualStopBlockTime.toNumber() === 0) {
    return false;
  }
  return stream.lastManualStopBlockTime.toNumber() > stream.lastManualResumeBlockTime.toNumber();
}

const getStreamUnitsPerSecond = (stream: any) => {
  if (stream.rateIntervalInSeconds.toNumber() === 0) {
    return 0;
  }
  return stream.rateAmountUnits.toNumber() / stream.rateIntervalInSeconds.toNumber();
}
