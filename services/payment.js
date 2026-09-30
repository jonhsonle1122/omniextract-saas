const QRCode = require('qrcode');
const walletService = require('./wallet');

class PaymentService {
  async generateCheckoutData(planId = 'starter', paymentMethod = 'usdc') {
    const plans = {
      starter: {
        id: 'starter',
        name: 'Starter Agent Pack',
        credits: 100,
        priceUSDC: 0.5,
        priceVND: 12500
      },
      pro: {
        id: 'pro',
        name: 'Pro Sentinel Pack',
        credits: 1000,
        priceUSDC: 4.5,
        priceVND: 110000
      },
      enterprise: {
        id: 'enterprise',
        name: 'Autonomous Swarm Pack',
        credits: 10000,
        priceUSDC: 35.0,
        priceVND: 875000
      }
    };

    const plan = plans[planId] || plans.starter;
    const walletInfo = walletService.getWalletInfo();
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    if (paymentMethod === 'vietqr') {
      const bank = process.env.VIETQR_BANK || 'MB';
      const account = process.env.VIETQR_ACCOUNT || '0987654321';
      const accountName = process.env.VIETQR_NAME || 'OMNIEXTRACT AGENT';
      const memo = `OMNI ${orderId}`;
      const vietqrUrl = `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${plan.priceVND}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;
      
      const qrDataUrl = await QRCode.toDataURL(vietqrUrl);

      return {
        orderId,
        plan,
        method: 'vietqr',
        amount: plan.priceVND,
        currency: 'VND',
        bankDetails: {
          bank,
          account,
          accountName,
          memo
        },
        qrImageUrl: vietqrUrl,
        qrCodeDataUrl: qrDataUrl
      };
    } else {
      // Base Network USDC Web3 payment
      // URI scheme for ERC-20 transfer on Base
      const amountUnits = BigInt(Math.floor(plan.priceUSDC * 1e6)).toString();
      const cryptoUri = `ethereum:${walletInfo.token.contract}@${walletInfo.chainId}/transfer?address=${walletInfo.address}&uint256=${amountUnits}`;
      const qrCodeDataUrl = await QRCode.toDataURL(cryptoUri);

      return {
        orderId,
        plan,
        method: 'usdc',
        amount: plan.priceUSDC,
        currency: 'USDC',
        network: walletInfo.network,
        chainId: walletInfo.chainId,
        tokenAddress: walletInfo.token.contract,
        recipientAddress: walletInfo.address,
        cryptoUri,
        qrCodeDataUrl
      };
    }
  }

  async completeCheckout(orderId, planId, method, txProof = null) {
    const plans = {
      starter: { credits: 100, priceUSDC: 0.5, priceVND: 12500 },
      pro: { credits: 1000, priceUSDC: 4.5, priceVND: 110000 },
      enterprise: { credits: 10000, priceUSDC: 35.0, priceVND: 875000 }
    };
    const plan = plans[planId] || plans.starter;
    const isCrypto = method === 'usdc';
    const amount = isCrypto ? plan.priceUSDC : plan.priceVND;
    const currency = isCrypto ? 'USDC' : 'VND';

    const result = walletService.createApiKey(planId, amount, currency, txProof);
    return {
      orderId,
      status: 'confirmed',
      apiKey: result.apiKey,
      credits: result.credits,
      tier: result.tier,
      message: 'Payment confirmed! API Key activated successfully.'
    };
  }
}

module.exports = new PaymentService();
