async function verifyTurnstile(req, res, next) {
  // Skip Turnstile check in local development or test environments
  if (process.env.NODE_ENV === 'development' || process.env.SMS_DRIVER === 'local') {
    return next();
  }

  const { turnstileToken } = req.body;
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Misconfiguration should not silently disable bot protection in prod.
    return res.status(500).json({ error: 'Security check is not configured.' });
  }

  if (!turnstileToken) {
    return res.status(400).json({ error: 'Security check token missing.' });
  }

  try {
    const ip = req.headers['cf-connecting-ip'] || req.ip;

    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', turnstileToken);
    formData.append('remoteip', ip);

    const cfResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    const result = await cfResponse.json();

    if (!result.success) {
      return res.status(403).json({ error: 'Security verification failed. Please try again.' });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Captcha verification service unavailable.' });
  }
}

module.exports = verifyTurnstile;
