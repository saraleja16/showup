namespace ShowUpBackend.Configuration;

public class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>SMTP host. For Brevo this is smtp-relay.brevo.com.</summary>
    public string SmtpHost { get; set; } = "smtp-relay.brevo.com";

    /// <summary>587 = STARTTLS (what Brevo recommends). 465 = implicit SSL.</summary>
    public int SmtpPort { get; set; } = 587;

    /// <summary>Brevo SMTP login (your Brevo account email).</summary>
    public string SmtpUser { get; set; } = string.Empty;

    /// <summary>Brevo SMTP key. Never commit this — set it via the Email__SmtpPassword env var.</summary>
    public string SmtpPassword { get; set; } = string.Empty;

    /// <summary>Must be an address you verified under Brevo → Senders.</summary>
    public string FromAddress { get; set; } = string.Empty;

    public string FromName { get; set; } = "ShowUp";

    /// <summary>Brevo API key used for transactional email delivery.</summary>
public string BrevoApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Whether to perform the certificate revocation (CRL/OCSP) lookup during the TLS handshake.
    /// Defaults to false because that lookup frequently cannot complete on macOS and on
    /// corporate networks, failing with "An incomplete certificate revocation check occurred."
    /// The certificate chain and hostname are still fully validated either way — this only skips
    /// the secondary "has this certificate been revoked?" network call.
    /// </summary>
    public bool CheckCertificateRevocation { get; set; } = false;

    /// <summary>How long a one-time code stays valid.</summary>
    public int OtpExpiryMinutes { get; set; } = 10;

    /// <summary>Failed verification attempts allowed against a single code before it is burned.</summary>
    public int OtpMaxAttempts { get; set; } = 5;

    /// <summary>Codes that may be requested per email address within OtpRateLimitWindowMinutes.</summary>
    public int OtpMaxSendsPerWindow { get; set; } = 3;

    public int OtpRateLimitWindowMinutes { get; set; } = 15;

    /// <summary>True when enough SMTP settings are present to actually send mail.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(SmtpHost)
        && !string.IsNullOrWhiteSpace(SmtpUser)
        && !string.IsNullOrWhiteSpace(SmtpPassword)
        && !string.IsNullOrWhiteSpace(FromAddress);
}
