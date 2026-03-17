// Enhanced OAuth callback handler with send-as discovery
// Add to server/tenant/index.mjs after existing OAuth callback

app.post('/api/tenant/email/oauth/callback', async (req, res) => {
  try {
    const { state, code, error } = req.body || {};
    
    if (error) {
      return res.status(400).json({ error: `OAuth error: ${error}` });
    }

    if (!state || !code) {
      return res.status(400).json({ error: 'Missing state or authorization code' });
    }

    // Parse and verify state
    const { customerId, provider, redirectPath } = await parseAndVerifyEmailOAuthState(state);
    
    // Exchange code for tokens
    const config = getEmailOAuthConfig(provider);
    if (!config) {
      return res.status(400).json({ error: 'Unsupported email provider' });
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Get user profile info
    const profileUrl = provider === 'gmail' 
      ? 'https://www.googleapis.com/oauth2/v2/userinfo'
      : 'https://graph.microsoft.com/v1.0/me';
    
    const profileResponse = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const profile = await profileResponse.json();
    const email = profile.email;
    const name = profile.name || profile.displayName;
    const providerUserId = profile.id || profile.id;

    if (!email) {
      throw new Error('Unable to retrieve email address from provider');
    }

    // Store email account
    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const accountResult = await query(
      `INSERT INTO email_accounts (
        customer_id, provider, email_address, display_name, provider_user_id,
        access_token, refresh_token, expires_at, scopes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
      ON CONFLICT (customer_id, provider, email_address) DO UPDATE
      SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, EXCLUDED.refresh_token),
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      RETURNING id`,
      [
        customerId, provider, email, name, providerUserId,
        tokenData.access_token, tokenData.refresh_token, expiresAt,
        tokenData.scope?.split(' ') || []
      ]
    );

    const emailAccountId = accountResult.rows[0].id;

    // Discover send-as aliases for Gmail accounts
    if (provider === 'gmail') {
      try {
        const aliases = await discoverGmailSendAsAliases(emailAccountId);
        await syncSendAsAliasesToDatabase(emailAccountId, aliases);
        
        logInfo('Gmail account connected with send-as aliases', {
          customerId,
          emailAccountId,
          aliasCount: aliases.length,
        });
      } catch (aliasError) {
        logError('Failed to discover send-as aliases', {
          customerId,
          emailAccountId,
          error: aliasError.message,
        });
        // Don't fail the OAuth flow, just log the error
      }
    }

    res.json({
      success: true,
      redirect: redirectPath,
      account: {
        id: emailAccountId,
        provider,
        email,
        name,
        status: 'active',
      },
    });
  } catch (error) {
    logError('Email OAuth callback failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});
