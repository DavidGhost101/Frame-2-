const localOtpStore = new Map();

async function sendSMSOTP(phoneNumber) {
  const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  localOtpStore.set(phoneNumber, { code: mockCode, expiresAt });

  console.log('\n==================================================');
  console.log('[LOCAL MOCK SMS DRIVER]');
  console.log(`To:   ${phoneNumber}`);
  console.log(`OTP:  ${mockCode}`);
  console.log('==================================================\n');

  return { status: 'pending', mockCode };
}

async function verifySMSOTP(phoneNumber, code) {
  const record = localOtpStore.get(phoneNumber);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    localOtpStore.delete(phoneNumber);
    return false;
  }

  // Developer bypass code, only reachable because this driver only loads
  // when SMS_DRIVER=local or NODE_ENV=development (see otpService.js)
  if (code === '666666' || record.code === code) {
    localOtpStore.delete(phoneNumber);
    return true;
  }
  return false;
}

module.exports = { sendSMSOTP, verifySMSOTP, localOtpStore };
