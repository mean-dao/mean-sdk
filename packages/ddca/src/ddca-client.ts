import {
	SYSVAR_RENT_PUBKEY,
	SystemProgram,
	PublicKey,
	Keypair,
    Signer,
    Connection,
    Transaction,
    TransactionInstruction,
    AccountMeta,
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from "@project-serum/anchor";
// const { SystemProgram, PublicKey, Connection, Transaction } = anchor.web3; // taking all of this directly from solana above
import { Wallet } from "@project-serum/anchor/src/provider";
import * as idl1 from './idl.json'; // force idl.json to the build output './lib' folder
const idl = require('./idl.json');

// CONSTANTS
const SYSTEM_PROGRAM_ID = anchor.web3.SystemProgram.programId;
const LAMPORTS_PER_SOL = anchor.web3.LAMPORTS_PER_SOL;
const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
const DDCA_OPERATING_ACCOUNT_ADDRESS = new PublicKey("3oSfkjQZKCneYvsCTZc9HViGAPqR8pYr4h9YeGB5ZxHf");
const HLA_PROGRAM_ADDRESS = new PublicKey("EPa4WdYPcGGdwEbq425DMZukU2wDUE1RWAGrPbRYSLRE");
const HLA_OPERATING_ACCOUNT_ADDRESS = new PublicKey("FZMd4pn9FsvMC55D4XQfaexJvKBtQpVuqMk5zuonLRDX");

/**
 * Anchor based client for the DDCA program
 */
export class DdcaClient {

    public connection: Connection;
    public provider: anchor.Provider;
    private program: anchor.Program;

    /**
     * Create a DDCA client
     */
    constructor(
        rpcUrl: string,
        anchorWallet: any,
        // commitment: Commitment | string = 'confirmed' as Commitment
        confirmOptions?: anchor.web3.ConfirmOptions
    ) {
        // const confirmationOptions = {
        //     preflightCommitment: commitment, 
        //     commitment: commitment
        // } as anchor.web3.ConfirmOptions;
        // const provider = this.getAnchorProvider(rpcUrl, anchorWallet, confirmationOptions as anchor.web3.Connection);
        const provider = this.getAnchorProvider(rpcUrl, anchorWallet, confirmOptions);
        this.connection = provider.connection;
        this.provider = provider;
        anchor.setProvider(provider);

        const programId = new anchor.web3.PublicKey(idl.metadata.address);
        this.program = new anchor.Program(idl, programId, provider); 
    }

    private getAnchorProvider(
        rpcUrl: string,
        // commitment: Commitment | string = 'confirmed',
        anchorWallet: Wallet,
        opts?: anchor.web3.ConfirmOptions) {

        opts = opts ?? anchor.Provider.defaultOptions();
        const connection = new Connection(rpcUrl, opts.preflightCommitment);

        const provider = new anchor.Provider(
            connection, anchorWallet, opts,
        );
        return provider;
    }

    public async createDdcaTx(
        ownerAccountAddress: PublicKey,
        // treasury: PublicKey | undefined,
        fromMint: PublicKey,
        toMint: PublicKey,
        fromDepositAmount: number,
        fromAmountPerSwap: number,
        intervalInSeconds: number,
        hlaAmmAccounts: Array<AccountMeta>,
        firstSwapMinimumOutAmount: number,
        firstSwapSlippage: number,
        ddcaName?: String,
    ): Promise<Transaction> {

        console.log("ownerAccountAddress received by createDdcaTx: %s", ownerAccountAddress.toBase58())

        const blockHeight = await this.connection.getSlot('confirmed');
        const blockHeightBn = new anchor.BN(blockHeight);
        console.log("blockHeightBn", blockHeightBn);
        // const blockHeightBytes = blockHeightBn.toBuffer('be', 8);
        const blockHeightBytes = blockHeightBn.toArrayLike(Buffer, 'be', 8);

        //ddca account pda and bump
        const [ddcaAccountPda, ddcaAccountPdaBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                ownerAccountAddress.toBuffer(),
                blockHeightBytes,
                Buffer.from(anchor.utils.bytes.utf8.encode("ddca-seed")),
            ],
            this.program.programId
        );

        //owner token account (from)
        const ownerFromTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            fromMint,
            ownerAccountAddress,
        );

        //ddca associated token account (from)
        const ddcaFromTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            fromMint,
            ddcaAccountPda,
            true,
        );
        //ddca associated token account (to)
        const ddcaToTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            toMint,
            ddcaAccountPda,
            true,
        );

        //ddca operating token account (from)
        const ddcaOperatingFromTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            fromMint,
            DDCA_OPERATING_ACCOUNT_ADDRESS,
        );

        //hla operating token account (from)
        const hlaOperatingFromTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            fromMint,
            HLA_OPERATING_ACCOUNT_ADDRESS,
        );

        // Instructions
        let ixs: Array<TransactionInstruction> | undefined = new Array<TransactionInstruction>();
        let txSigners: Array<Signer> = new Array<Signer>();

        let ddcaOperatingFromAtaCreateInstruction = await createAtaCreateInstructionIfNotExists(
            ddcaOperatingFromTokenAccountAddress,
            fromMint,
            DDCA_OPERATING_ACCOUNT_ADDRESS,
            ownerAccountAddress,
            this.connection);
        if (ddcaOperatingFromAtaCreateInstruction !== null)
            ixs.push(ddcaOperatingFromAtaCreateInstruction);

        let hlaOperatingFromAtaCreateInstruction = await createAtaCreateInstructionIfNotExists(
            hlaOperatingFromTokenAccountAddress,
            fromMint,
            HLA_OPERATING_ACCOUNT_ADDRESS,
            ownerAccountAddress,
            this.connection);
        if (hlaOperatingFromAtaCreateInstruction !== null)
            ixs.push(hlaOperatingFromAtaCreateInstruction);

        if(ixs.length === 0)
            ixs = undefined;

        console.log("TEST PARAMETERS:")
        console.log("  Program ID:                           " + this.program.programId);
        console.log("  payer.address:                        " + ownerAccountAddress);
        console.log("  fromMint:                             " + fromMint);
        console.log("  toMint:                               " + toMint);
        console.log("  blockHeight:                          " + blockHeight);
        console.log();
        console.log("  ownerAccountAddress:                  " + ownerAccountAddress);
        console.log("  ownerFromTokenAccountAddress:         " + ownerFromTokenAccountAddress);
        console.log();
        console.log("  ddcaAccountPda:                       " + ddcaAccountPda);
        console.log("  ddcaAccountPdaBump:                   " + ddcaAccountPdaBump);
        console.log("  ddcaFromTokenAccountAddress:          " + ddcaFromTokenAccountAddress);
        console.log("  ddcaToTokenAccountAddress:            " + ddcaToTokenAccountAddress);
        console.log();
        console.log("  DDCA_OPERATING_ACCOUNT_ADDRESS:       " + DDCA_OPERATING_ACCOUNT_ADDRESS);
        console.log("  ddcaOperatingFromTokenAccountAddress: " + ddcaOperatingFromTokenAccountAddress);
        console.log();
        console.log("  HLA_PROGRAM_ADDRESS:                  " + HLA_PROGRAM_ADDRESS);
        console.log("  HLA_OPERATING_ACCOUNT_ADDRESS:        " + HLA_OPERATING_ACCOUNT_ADDRESS);
        console.log("  hlaOperatingFromTokenAccountAddress:  " + hlaOperatingFromTokenAccountAddress);
        console.log();
        console.log("  SYSTEM_PROGRAM_ID:                    " + SYSTEM_PROGRAM_ID);
        console.log("  TOKEN_PROGRAM_ID:                     " + TOKEN_PROGRAM_ID);
        console.log("  ASSOCIATED_TOKEN_PROGRAM_ID:          " + ASSOCIATED_TOKEN_PROGRAM_ID);
        console.log();  

        const createTx = await this.program.transaction.create(new anchor.BN(blockHeight), ddcaAccountPdaBump,
            new anchor.BN(fromDepositAmount), new anchor.BN(fromAmountPerSwap), new anchor.BN(intervalInSeconds),
            new anchor.BN(firstSwapMinimumOutAmount), firstSwapSlippage,
            {
                accounts: {
                    // owner
                    ownerAccount: ownerAccountAddress,
                    ownerFromTokenAccount: ownerFromTokenAccountAddress,
                    // ddca
                    ddcaAccount: ddcaAccountPda,
                    fromMint: fromMint,
                    fromTokenAccount: ddcaFromTokenAccountAddress,
                    toMint: toMint,
                    toTokenAccount: ddcaToTokenAccountAddress,
                    operatingAccount: DDCA_OPERATING_ACCOUNT_ADDRESS,
                    operatingFromTokenAccount: ddcaOperatingFromTokenAccountAddress,
                    // hybrid liquidity aggregator accounts
                    hlaProgram: HLA_PROGRAM_ADDRESS,
                    hlaOperatingAccount: HLA_OPERATING_ACCOUNT_ADDRESS,
                    hlaOperatingFromTokenAccount: hlaOperatingFromTokenAccountAddress,
                    // system accounts
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
                },
                // signers: [ownerAccountAddress],
                instructions: ixs,
                // hybrid liquidity aggregator specific amm pool accounts
                remainingAccounts: hlaAmmAccounts,
            }
        );
        
        createTx.feePayer = ownerAccountAddress;
        let hash = await this.connection.getRecentBlockhash(this.connection.commitment);
        createTx.recentBlockhash = hash.blockhash;

        console.log("createTx", createTx);
        return createTx;
    }
}

async function createAtaCreateInstructionIfNotExists(
    ataAddress: PublicKey, 
    mintAddress: PublicKey, 
    ownerAccountAddress: PublicKey, 
    payerAddress: PublicKey, 
    // tokenClient: Token,
    connection: Connection
    ): Promise<TransactionInstruction | null> {
  try{
    const ata = await connection.getAccountInfo(ataAddress);
    if(!ata){
        console.log("ATA: %s for mint: %s was not found. Generating 'create' instruction...", ataAddress.toBase58(), mintAddress.toBase58());
        let [_, createIx] = await createAtaCreateInstruction(ataAddress, mintAddress, ownerAccountAddress, payerAddress);
        return createIx;
    }
    
    console.log("ATA: %s for mint: %s already exists", ataAddress.toBase58(), mintAddress.toBase58());
    return null;
  } catch (err) {
      console.log("Unable to find associated account: %s", err);
      throw Error("Unable to find associated account");
  }
}

async function createAtaCreateInstruction(
    ataAddress: PublicKey, 
    mintAddress: PublicKey, 
    ownerAccountAddress: PublicKey, 
    payerAddress: PublicKey
    ): Promise<[PublicKey, TransactionInstruction]> {
  if(ataAddress === null){
    ataAddress = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mintAddress,
      ownerAccountAddress,
    );
  }

  let ataCreateInstruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintAddress,
    ataAddress,
    ownerAccountAddress,
    payerAddress,
  );
  return [ataAddress, ataCreateInstruction];
}