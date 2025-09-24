exports.getHealth = async (req, res) => {
  try {
    const envFlag = process.env.DB_SUPPORTS_TRANSACTIONS === 'true';
    const appFlag = req?.app?.locals?.dbSupportsTransactions === true;
    return res.json({ ok: true, dbSupportsTransactions_env: envFlag, dbSupportsTransactions_appLocal: appFlag });
  } catch (err) {
    console.error('Health check failed', err);
    return res.status(500).json({ ok: false });
  }
};
