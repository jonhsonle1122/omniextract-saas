const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class WalletService {
  constructor() {
    this.ledgerPath = path.join(__dirname, '..', 'data', 'ledger.json');
    this.initLedger();
    this.initWallet();
  }

  initLedger() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.ledgerPath)) {
      const initial = {
        totalRevenueUSDC: 0.0,
        totalRevenueVND: 0,
        totalRequestsServed: 0,
        paidRequests: 0,
        freeRequests: 0,
        activeApiKeys: {
          'demo-free-key-guest': {
            name: 'Demo Free Tier',
            credits: 5,
            tier: 'free',
            createdAt: new Date().toISOString()
          }
        },
        transactions: []
      };
      fs.writeFileSync(this.ledgerPath, JSON.stringify(initial, null, 2));
    }
  }

  getLedger() {
    try {
      return JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
    } catch {
      return {
        totalRevenueUSDC: 0,
        totalRevenueVND: 0,
        totalRequestsServed: 0,
        paidRequests: 0,
        freeRequests: 0,
        activeApiKeys: {},
        transactions: []
      };
    }
  }

  saveLedger(data) {
    fs.writeFileSync(this.ledgerPath, JSON.stringify(data, null, 2));
  }

  initWallet() {
    const privateKey = process.env.AGENT_WALLET_KEY;
    if (privateKey) {
      try {
        this.wallet = new ethers.Wallet(privateKey);
      } catch {
        this.wallet = ethers.Wallet.createRandom();
      }
    } else {
      this.wallet = ethers.Wallet.createRandom();
    }
    this.address = this.wallet.address;
    this.network = process.env.NETWORK || 'Base';
    this.chainId = parseInt(process.env.CHAIN_ID || '8453');
    this.tokenSymbol = process.env.TOKEN_SYMBOL || 'USDC';
    this.tokenAddress = process.env.TOKEN_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    this.pricePerRequestUSDC = parseFloat(process.env.PRICE_PER_REQUEST_USDC || '0.005');
  }

  getWalletInfo() {
    const ledger = this.getLedger();
    return {
      agentName: process.env.AGENT_NAME || 'OmniExtract Agent Guard',
      address: this.address,
      network: this.network,
      chainId: this.chainId,
      token: {
        symbol: this.tokenSymbol,
        contract: this.tokenAddress,
        decimals: 6
      },
      pricePerRequestUSDC: this.pricePerRequestUSDC,
      totalRevenueUSDC: Number(ledger.totalRevenueUSDC.toFixed(4)),
      totalRevenueVND: ledger.totalRevenueVND,
      totalRequestsServed: ledger.totalRequestsServed,
      paidRequests: ledger.paidRequests,
      freeRequests: ledger.freeRequests,
      transactionCount: ledger.transactions.length
    };
  }

  createApiKey(tier = 'starter', paidAmount = 0, currency = 'USDC', txHash = null) {
    const ledger = this.getLedger();
    const apiKey = 'omni_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    
    let credits = 100;
    if (tier === 'pro') credits = 1000;
    if (tier === 'enterprise') credits = 10000;
    if (tier === 'pay-per-request') credits = 1;

    ledger.activeApiKeys[apiKey] = {
      name: `${tier.toUpperCase()} Key`,
      tier,
      credits,
      createdAt: new Date().toISOString()
    };

    if (currency === 'USDC') {
      ledger.totalRevenueUSDC += paidAmount;
    } else {
      ledger.totalRevenueVND += paidAmount;
    }

    ledger.transactions.unshift({
      id: 'tx_' + Date.now(),
      type: 'purchase_key',
      apiKey,
      tier,
      credits,
      amount: paidAmount,
      currency,
      txHash: txHash || '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''),
      timestamp: new Date().toISOString()
    });

    this.saveLedger(ledger);
    return { apiKey, credits, tier };
  }

  verifyAndConsumeKey(apiKey) {
    const ledger = this.getLedger();
    if (!apiKey || !ledger.activeApiKeys[apiKey]) {
      return { valid: false, reason: 'INVALID_API_KEY' };
    }

    const keyInfo = ledger.activeApiKeys[apiKey];
    if (keyInfo.credits <= 0) {
      return { valid: false, reason: 'CREDITS_EXHAUSTED' };
    }

    keyInfo.credits -= 1;
    ledger.totalRequestsServed += 1;
    if (keyInfo.tier === 'free') {
      ledger.freeRequests += 1;
    } else {
      ledger.paidRequests += 1;
    }

    this.saveLedger(ledger);
    return { valid: true, remainingCredits: keyInfo.credits, tier: keyInfo.tier };
  }

  recordAgentMicropayment(txHash, amount = 0.005) {
    const ledger = this.getLedger();
    ledger.totalRevenueUSDC += amount;
    ledger.totalRequestsServed += 1;
    ledger.paidRequests += 1;

    ledger.transactions.unshift({
      id: 'tx_x402_' + Date.now(),
      type: 'x402_micropayment',
      agent: 'External AI Agent',
      amount,
      currency: 'USDC',
      txHash: txHash || '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''),
      timestamp: new Date().toISOString()
    });

    this.saveLedger(ledger);
    return true;
  }

  recordWithdrawal(targetAddress, amountUSDC) {
    const ledger = this.getLedger();
    if (ledger.totalRevenueUSDC < amountUSDC) {
      throw new Error(`Insufficient balance. Current: ${ledger.totalRevenueUSDC} USDC, requested: ${amountUSDC} USDC`);
    }

    ledger.totalRevenueUSDC -= amountUSDC;
    const withdrawTx = {
      id: 'tx_wd_' + Date.now(),
      type: 'withdrawal',
      targetAddress,
      amount: amountUSDC,
      currency: 'USDC',
      txHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''),
      timestamp: new Date().toISOString()
    };

    ledger.transactions.unshift(withdrawTx);
    this.saveLedger(ledger);
    return withdrawTx;
  }
}

module.exports = new WalletService();
