const twilio = require('twilio');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials are not configured.');
    }
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

async function sendSMSOTP(phoneNumber) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  return await getClient().verify.v2
    .services(serviceSid)
    .verifications.create({ to: phoneNumber, channel: 'sms' });
}

async function verifySMSOTP(phoneNumber, code) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const check = await getClient().verify.v2
    .services(serviceSid)
    .verificationChecks.create({ to: phoneNumber, code });

  return check.status === 'approved';
}

module.exports = { sendSMSOTP, verifySMSOTP };
