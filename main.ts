import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    LAMPORTS_PER_SOL,
    Account,
    Signer,

} from '@solana/web3.js';

import {
    getProgramAccount,
    getPayerAccount,
    AVAILABLE_PROGRAM_ACTIONS,
    PROGRAM_ACTIONS,

} from './src/utils';

import { Constants } from './src/constants';
import { Layout } from './src/layout';
import { u64Number } from './src/u64Number';

const prompt = require('prompt-sync')();
const connection = new Connection('https://devnet.solana.com', 'confirmed');

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createStream() {
    // console.log('Creating accounts');
    // console.log('');
    // const programAccount = await getProgramAccount();
    // console.log('Program account: ' + programAccount.publicKey.toBase58());
    // const payerAccount = await getPayerAccount();
    // console.log('Payer account: ' + payerAccount.publicKey.toBase58());
    // console.log('');

    // // const treasurerPublicKey = new PublicKey(prompt('Type your secret key: '));
    // const treasurerPrivateKeyArray = prompt('Type your private key: ');
    // const treasurerPrivateKey = Buffer.from(JSON.parse(treasurerPrivateKeyArray))
    // console.log('');
    // const treasurerAccount = Keypair.fromSecretKey(treasurerPrivateKey);
    // const treasurerAccountInfo = await connection.getAccountInfo(treasurerAccount.publicKey);
    // console.log('My account');
    // console.log('');
    // console.log(`Address: ${treasurerAccount.publicKey.toBase58()}`);
    // console.log(`Balance: ${treasurerAccountInfo != null ? treasurerAccountInfo.lamports / LAMPORTS_PER_SOL : 0} SOL`);
    // console.log('');

    // const beneficiaryAddressKey = new PublicKey(prompt('Type the beneficiary account address: '));
    // console.log('');
    // const beneficiaryAccount = (await connection.getAccountInfo(beneficiaryAddressKey));
    // console.log('Beneficiary account');
    // console.log('');
    // console.log(`Address: ${beneficiaryAddressKey.toBase58()}`);
    // console.log(`Balance: ${beneficiaryAccount !== null ? beneficiaryAccount.lamports / LAMPORTS_PER_SOL : 0} SOL`);
    // console.log('');

    // let streamFriendlyName = prompt('Enter a friendly name for the money stream (OPTIONAL): ');
    // let initialAmount = prompt('Initial deposit amount (OPTIONAL): ');
    // let rateAmount = prompt('Rate amount: ');
    // let rateInterval = prompt('Rate interval in seconds (OPTIONAL, default HOUR = 60 seconds): ');

    // console.log('');
    // console.log('Creating the money stream');

    // const programId = new PublicKey(Constants.STREAM_PROGRAM_ID);
    // const streaming = new Streaming(connection, programId, payerAccount);
    // let associatedToken = new PublicKey(Constants.ASSOCIATED_TOKEN_ACCOUNT);

    // let transaction = await streaming.createStreamTransaction(
    //     // treasurerAccount,
    //     treasurerAccount.publicKey,
    //     beneficiaryAddressKey,
    //     PublicKey.default,
    //     associatedToken,
    //     rateAmount,
    //     rateInterval,
    //     new Date(),
    //     streamFriendlyName,
    //     initialAmount
    // );



    // let txId = await connection.sendTransaction(
    //     transaction,
    //     [signer],
    //     {
    //         skipPreflight: false, preflightCommitment: 'singleGossip'
    //     });

    // console.log(txId);
}

async function create_stream() {

    console.log('Creating accounts');
    console.log('');
    const programAccount = await getProgramAccount();
    console.log('Program account: ' + programAccount.publicKey.toBase58());
    const payerAccount = await getPayerAccount();
    console.log('Payer account: ' + payerAccount.publicKey.toBase58());
    console.log('');

    // const treasurerPublicKey = new PublicKey(prompt('Type your secret key: '));
    const treasurerPrivateKeyArray = prompt('Type your private key: ');
    const treasurerPrivateKey = Buffer.from(JSON.parse(treasurerPrivateKeyArray))
    console.log('');
    const treasurerAccount = Keypair.fromSecretKey(treasurerPrivateKey);
    const treasurerAccountInfo = (await connection.getAccountInfo(treasurerAccount.publicKey));
    console.log('My account');
    console.log('');
    console.log(`Address: ${treasurerAccount.publicKey.toBase58()}`);
    console.log(`Balance: ${treasurerAccountInfo !== null ? treasurerAccountInfo.lamports / LAMPORTS_PER_SOL : 0} SOL`);
    console.log('');

    const beneficiaryAddressKey = new PublicKey(prompt('Type the beneficiary account address: '));
    console.log('');
    const beneficiaryAccount = (await connection.getAccountInfo(beneficiaryAddressKey));
    console.log('Beneficiary account');
    console.log('');
    console.log(`Address: ${beneficiaryAddressKey.toBase58()}`);
    console.log(`Balance: ${beneficiaryAccount !== null ? beneficiaryAccount.lamports / LAMPORTS_PER_SOL : 0} SOL`);
    console.log('');

    let treasuryAccount = undefined;
    let treasuryAddressKey: PublicKey = PublicKey.default;
    let createTreasuryInstruction = undefined;
    const treasuryAddress = prompt('Type the account address to use as the escrow of this stream (OPTIONAL): ');
    console.log('');

    if (treasuryAddress.length) {
        treasuryAddressKey = new PublicKey(treasuryAddress);
    } else {
        console.log('Creating a new treasury account');
        console.log('');

        await connection.getMinimumBalanceForRentExemption(0)
            .then((amount) => {
                treasuryAccount = Keypair.generate();
                treasuryAddressKey = treasuryAccount.publicKey;
                createTreasuryInstruction = SystemProgram.createAccount({
                    fromPubkey: treasurerAccount.publicKey,
                    newAccountPubkey: treasuryAddressKey,
                    lamports: amount,
                    space: 0,
                    programId: programAccount.publicKey
                });
            })
            .catch((e) => { console.log(e); })
            .finally(() => { });
    }

    let streamFriendlyName = prompt('Enter a friendly name for the money stream (OPTIONAL): ');
    let initialAmount = prompt('Initial deposit amount (OPTIONAL): ');
    let rateAmount = prompt('Rate amount: ');
    let rateInterval = prompt('Rate interval in seconds (OPTIONAL, default HOUR = 60 seconds): ');

    console.log('');
    console.log('Creating the money stream');

    let streamAccount = Keypair.generate(); //Keypair;
    let createStreamAccountInstruction = undefined;

    await connection.getMinimumBalanceForRentExemption(Layout.StreamLayout.span)
        .then((amount) => {
            streamAccount = Keypair.generate();
            createStreamAccountInstruction = SystemProgram.createAccount({
                fromPubkey: treasurerAccount.publicKey,
                newAccountPubkey: streamAccount.publicKey,
                lamports: amount,
                space: Layout.StreamLayout.span,
                programId: programAccount.publicKey
            });
        })
        .catch((e) => { console.log(e); })
        .finally(() => { });

    let data = Buffer.alloc(Layout.createStreamLayout.span)
    {
        let nameBuffer = Buffer.alloc(32, streamFriendlyName);

        console.log(nameBuffer);

        const decodedData = {
            tag: 0,
            stream_name: nameBuffer,
            treasurer_address: Buffer.from(treasurerAccount.publicKey.toBuffer()),
            treasury_address: Buffer.from(treasuryAddressKey.toBuffer()),
            beneficiary_withdrawal_address: Buffer.from(beneficiaryAddressKey.toBuffer()),
            escrow_token_address: Buffer.from(new PublicKey(Constants.ASSOCIATED_TOKEN_ACCOUNT).toBuffer()),
            funding_amount: new u64Number(parseInt(initialAmount)).toBuffer(),
            rate_amount: new u64Number(rateAmount).toBuffer(),
            rate_interval_in_seconds: new u64Number(parseInt(rateInterval)).toBuffer(), // default = MIN
            start_utc: new u64Number(Date.now()).toBuffer(),
            rate_cliff_in_seconds: new u64Number(0).toBuffer(),
            cliff_vest_amount: new u64Number(0).toBuffer(),
            cliff_vest_percent: new u64Number(100).toBuffer(),
        };

        const encodeLength = Layout.createStreamLayout.encode(decodedData, data);
        data = data.slice(0, encodeLength);
    };

    console.log(data);

    let createStreamInstruction = new TransactionInstruction({
        keys: [
            { pubkey: treasurerAccount.publicKey, isSigner: true, isWritable: false },
            { pubkey: beneficiaryAddressKey, isSigner: false, isWritable: false },
            { pubkey: treasuryAddressKey, isSigner: false, isWritable: true },
            { pubkey: streamAccount.publicKey, isSigner: false, isWritable: true },
        ],
        programId: programAccount.publicKey,
        data
    });

    const createStreamTx = new Transaction();
    createStreamTx.feePayer = treasurerAccount.publicKey;
    let signers: Array<Signer> = [treasurerAccount];

    if (createTreasuryInstruction !== undefined) {
        createStreamTx.add(createTreasuryInstruction);

        if (treasuryAccount !== undefined) {
            signers.push(treasuryAccount);
        }
    }

    signers.push(streamAccount);

    if (createStreamAccountInstruction !== undefined) {
        createStreamTx.add(createStreamAccountInstruction);
    }

    createStreamTx.add(createStreamInstruction);
    let { blockhash } = await connection.getRecentBlockhash();
    createStreamTx.recentBlockhash = blockhash
    createStreamTx.sign(...signers);

    console.log('');

    const result = await connection.sendTransaction(
        createStreamTx,
        signers,
        {
            skipPreflight: false, preflightCommitment: 'singleGossip'
        });

    if (!result.length) {
        console.log('Transaction failed :(');
    } else {

        console.log(`Transaction ID: ${result}`);
        console.log('');

        // let info = await connection.getAccountInfo(treasuryAccount.publicKey);
        // console.log('');
        // console.log('Treasury account');
        // console.log('');
        // console.log(`Address: ${treasuryAccount.publicKey.toBase58()}`);
        // console.log(`Balance: ${(info !== null ? (info.lamports / LAMPORTS_PER_SOL) : 0)} SOL`);
        // console.log('');

        // info = await connection.getAccountInfo(streamAccount.publicKey);
        // console.log('');
        // console.log('Stream account');
        // console.log('');
        // console.log(`Address: ${streamAccount.publicKey.toBase58()}`);
        // console.log(`Balance: ${(info !== null ? (info.lamports / LAMPORTS_PER_SOL) : 0)} SOL`);
        // console.log('');
    }
};

async function close_stream() {

}

async function main() {

    console.log('Initializing Streaming Program ...');
    console.log('Available program actions:');
    console.log('');

    AVAILABLE_PROGRAM_ACTIONS.forEach(function (action, index) {
        console.log(`ID: ${action.id} -> ${action.name}`);
    });

    console.log('');
    const id = parseInt(prompt('Select an action to ID execute : '));
    console.log('');

    switch (id) {
        case PROGRAM_ACTIONS.createStream: {
            await create_stream();
            // await createStream();
            break;
        }
        case PROGRAM_ACTIONS.createStream: {
            await close_stream();
            break;
        }
        default: {
            console.log('Closing program ...')
            sleep(1000);
            break;
        }
    }
}

main().then(
    () => process.exit(),
    (err: any) => {
        console.error(err);
        process.exit(-1);
    },
);