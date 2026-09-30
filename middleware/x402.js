const walletService = require('../services/wallet');

function x402Middleware(options = {}) {
  return function(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const paymentProof = req.headers['x-payment-proof'] || req.headers['x-402-tx'];

    // 1. Direct payment proof provided by calling Agent
    if (paymentProof && typeof paymentProof === 'string' && paymentProof.startsWith('0x')) {
      walletService.recordAgentMicropayment(paymentProof, walletService.pricePerRequestUSDC);
      req.agentPayment = {
        type: 'x402_onchain',
        txHash: paymentProof,
        amount: walletService.pricePerRequestUSDC
      };
      return next();
    }

    // 2. API Key provided
    if (apiKey) {
      const verification = walletService.verifyAndConsumeKey(apiKey);
      if (verification.valid) {
        req.apiKeyInfo = verification;
        return next();
      } else {
        return res.status(401).json({
          status: 'error',
          error: 'Unauthorized',
          code: 401,
          reason: verification.reason,
          message: verification.reason === 'CREDITS_EXHAUSTED' 
            ? 'API key credits exhausted. Please top up or pay per request via x402.' 
            : 'Invalid API key provided.'
        });
      }
    }

    // 3. No valid key and no payment proof -> Issue HTTP 402
    const walletInfo = walletService.getWalletInfo();

    res.set({
      'X-402-Payment-Required': 'true',
      'X-402-Version': '1.0',
      'X-402-Recipient': walletInfo.address,
      'X-402-Network': walletInfo.network,
      'X-402-Chain-Id': walletInfo.chainId.toString(),
      'X-402-Token-Symbol': walletInfo.token.symbol,
      'X-402-Token-Address': walletInfo.token.contract,
      'X-402-Amount': walletInfo.pricePerRequestUSDC.toString(),
      'X-402-Currency': 'USDC',
      'WWW-Authenticate': `x402 realm="OmniExtract Agent Service", token="USDC", address="${walletInfo.address}", amount="${walletInfo.pricePerRequestUSDC}"`
    });

    return res.status(402).json({
      status: 'payment_required',
      code: 402,
      error: 'Payment Required',
      message: `Access to this agent service requires micropayment of ${walletInfo.pricePerRequestUSDC} USDC on ${walletInfo.network} or an active API Key.`,
      protocol: 'x402-agent-settlement',
      payment: {
        recipientAddress: walletInfo.address,
        network: walletInfo.network,
        chainId: walletInfo.chainId,
        token: walletInfo.token,
        pricePerRequestUSDC: walletInfo.pricePerRequestUSDC,
        howToPay: {
          step1: `Send ${walletInfo.pricePerRequestUSDC} USDC to ${walletInfo.address} on ${walletInfo.network} (Chain ID ${walletInfo.chainId}).`,
          step2: "Replay your request including header: 'X-Payment-Proof: <transaction_hash>'.",
          alternative: "Or purchase an API key pack instantly via web portal or VietQR."
        }
      }
    });
  };
}

module.exports = x402Middleware;
